import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError, auditLog } from '@/lib/rbac';
import { safeError } from '@/lib/logger';

// POST — disable 2FA
export async function POST() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    await prisma.user.update({
      where: { id: auth.userId },
      data: { totpEnabled: false, totpSecret: null },
    });

    auditLog(auth.userId, '2fa:disabled').catch(() => {});
    return NextResponse.json({ ok: true, message: '2FA desactive' });
  } catch (err) {
    safeError('POST /api/auth/2fa/disable', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
