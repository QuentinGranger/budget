import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  verifyPassword, setSessionCookie, computeFingerprint, checkRateLimit,
  isAccountLocked, getLockoutUntil, MAX_FAILED_ATTEMPTS,
  AUTH_ERROR_NEUTRAL, AUTH_ERROR_LOCKED, AUTH_ERROR_RATE_LIMITED, AUTH_ERROR_2FA_REQUIRED,
} from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { hmacHash, decrypt } from '@/lib/crypto';
import { auditLog } from '@/lib/rbac';
import * as OTPAuth from 'otpauth';
import { safeError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: AUTH_ERROR_RATE_LIMITED }, { status: 429 });
    }

    const { email, password, totpCode } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHashValue = hmacHash(normalizedEmail);

    const user = await prisma.user.findUnique({ where: { emailHash: emailHashValue } });
    if (!user) {
      return NextResponse.json({ error: AUTH_ERROR_NEUTRAL }, { status: 401 });
    }

    // Account lockout check
    if (isAccountLocked(user.lockedUntil)) {
      return NextResponse.json({ error: AUTH_ERROR_LOCKED }, { status: 423 });
    }

    // Email must be verified before login
    if (!user.emailVerified) {
      return NextResponse.json({ error: 'Veuillez verifier votre email avant de vous connecter.' }, { status: 403 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const data: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: attempts };
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        data.lockedUntil = getLockoutUntil();
      }
      await prisma.user.update({ where: { id: user.id }, data });
      auditLog(user.id, 'login:failed', undefined, { reason: 'invalid_password', attempts }, ip).catch(() => {});
      return NextResponse.json({ error: AUTH_ERROR_NEUTRAL }, { status: 401 });
    }

    // 2FA check
    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return NextResponse.json({ error: AUTH_ERROR_2FA_REQUIRED, requires2FA: true }, { status: 403 });
      }

      const decryptedSecret = decrypt(user.totpSecret);
      const totp = new OTPAuth.TOTP({
        issuer: 'CapBudget',
        label: normalizedEmail,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(decryptedSecret),
      });

      const delta = totp.validate({ token: totpCode, window: 1 });
      if (delta === null) {
        auditLog(user.id, 'login:failed', undefined, { reason: 'invalid_2fa' }, ip).catch(() => {});
        return NextResponse.json({ error: 'Code 2FA invalide' }, { status: 401 });
      }
    }

    // Reset failed attempts on success
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastActivity: new Date() },
    });

    const ua = req.headers.get('user-agent') || '';
    const fingerprint = computeFingerprint(ua, ip);
    await setSessionCookie(user.id, user.tokenVersion, fingerprint);

    auditLog(user.id, 'login:success', undefined, { ip, ua: ua.slice(0, 100) }, ip).catch(() => {});
    return NextResponse.json({ ok: true, onboarded: user.onboarded });
  } catch (err) {
    safeError('POST /api/auth/login', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
