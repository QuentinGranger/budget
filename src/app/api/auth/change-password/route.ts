import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError, auditLog } from '@/lib/rbac';
import { verifyPassword, hashPassword, validatePasswordPolicy, isPasswordReused, savePasswordToHistory } from '@/lib/auth';
import { checkAuthRateLimit, getClientIp } from '@/lib/rate-limit';
import { safeError } from '@/lib/logger';

// POST — change password (requires current password)
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkAuthRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'api.rateLimited' }, { status: 429 });
    }

    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'api.currentAndNewRequired' }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: 'api.samePassword' }, { status: 400 });
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return NextResponse.json({ error: 'api.weakPassword', details: policy.errors }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'api.userNotFound' }, { status: 404 });
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'api.wrongCurrentPassword' }, { status: 401 });
    }

    // L5: Check password history
    if (await isPasswordReused(auth.userId, newPassword)) {
      return NextResponse.json({ error: 'api.passwordReused' }, { status: 400 });
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        passwordHash: newHash,
        tokenVersion: { increment: 1 }, // Invalidate all other sessions
      },
    });
    await savePasswordToHistory(auth.userId, user.passwordHash);

    auditLog(auth.userId, 'password:changed', undefined, undefined, ip).catch(() => {});
    return NextResponse.json({ ok: true, message: 'api.passwordChanged' });
  } catch (err) {
    safeError('POST /api/auth/change-password', err);
    return NextResponse.json({ error: 'api.serverError' }, { status: 500 });
  }
}
