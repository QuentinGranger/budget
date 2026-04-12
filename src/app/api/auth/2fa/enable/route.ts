import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError, auditLog } from '@/lib/rbac';
import { decrypt } from '@/lib/crypto';
import { checkTotpRateLimit } from '@/lib/rate-limit';
import * as OTPAuth from 'otpauth';
import { safeError } from '@/lib/logger';

// POST — verify TOTP code and enable 2FA
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    const userId = auth.userId;

    // Per-user TOTP brute-force protection (5 attempts / 5 min)
    const limit = await checkTotpRateLimit(userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Attendez 5 minutes avant de reessayer.' },
        { status: 429 },
      );
    }

    const { code } = await req.json();
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Le code doit contenir exactement 6 chiffres' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, totpSecret: true, totpEnabled: true } });

    if (!user || !user.totpSecret) {
      return NextResponse.json({ error: 'Lancez d\'abord le setup 2FA' }, { status: 400 });
    }

    if (user.totpEnabled) {
      return NextResponse.json({ error: '2FA deja active' }, { status: 400 });
    }

    const decryptedSecret = decrypt(user.totpSecret);
    const plainEmail = decrypt(user.email);
    const totp = new OTPAuth.TOTP({
      issuer: 'CapBudget',
      label: plainEmail,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(decryptedSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return NextResponse.json(
        { error: 'Code invalide. Verifiez votre application.' },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    auditLog(userId, '2fa:enabled').catch(() => {});
    return NextResponse.json({ ok: true, message: '2FA active avec succes' });
  } catch (err) {
    safeError('POST /api/auth/2fa/enable', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
