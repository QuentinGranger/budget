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
      return NextResponse.json({ error: 'api.rateLimited' }, { status: 429 });
    }

    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: 'api.tokenPasswordRequired' }, { status: 400 });
    }

    const policy = validatePasswordPolicy(password);
    if (!policy.valid) {
      return NextResponse.json({ error: 'api.weakPassword', details: policy.errors }, { status: 400 });
    }

    const userId = await verifyPurposeToken(token, 'reset');
    if (!userId) {
      return NextResponse.json({ error: 'api.invalidOrExpiredToken' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, resetToken: token },
    });

    if (!user) {
      return NextResponse.json({ error: 'api.invalidToken' }, { status: 400 });
    }

    if (user.resetTokenExpiry && new Date() > new Date(user.resetTokenExpiry)) {
      return NextResponse.json({ error: 'api.expiredToken' }, { status: 400 });
    }

    // L5: Check password history
    if (await isPasswordReused(user.id, password)) {
      return NextResponse.json({ error: 'api.passwordReused' }, { status: 400 });
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
    return NextResponse.json({ ok: true, message: 'api.passwordResetSuccess' });
  } catch (err) {
    safeError('POST /api/auth/reset-password', err);
    return NextResponse.json({ error: 'api.serverError' }, { status: 500 });
  }
}
