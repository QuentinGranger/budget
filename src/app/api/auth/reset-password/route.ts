import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPurposeToken, hashPassword, validatePasswordPolicy, checkRateLimit, isPasswordReused, savePasswordToHistory } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { auditLog } from '@/lib/rbac';
import { safeError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Reessayez plus tard.' }, { status: 429 });
    }

    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: 'Token et mot de passe requis' }, { status: 400 });
    }

    const policy = validatePasswordPolicy(password);
    if (!policy.valid) {
      return NextResponse.json({ error: 'Mot de passe trop faible', details: policy.errors }, { status: 400 });
    }

    const userId = await verifyPurposeToken(token, 'reset');
    if (!userId) {
      return NextResponse.json({ error: 'Token invalide ou expire' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, resetToken: token },
    });

    if (!user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 400 });
    }

    if (user.resetTokenExpiry && new Date() > new Date(user.resetTokenExpiry)) {
      return NextResponse.json({ error: 'Token expire' }, { status: 400 });
    }

    // L5: Check password history
    if (await isPasswordReused(user.id, password)) {
      return NextResponse.json({ error: 'Ce mot de passe a deja ete utilise recemment. Choisissez-en un nouveau.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    await savePasswordToHistory(user.id, user.passwordHash);

    auditLog(user.id, 'password:reset', undefined, undefined, ip).catch(() => {});
    return NextResponse.json({ ok: true, message: 'Mot de passe reinitialise avec succes' });
  } catch (err) {
    safeError('POST /api/auth/reset-password', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
