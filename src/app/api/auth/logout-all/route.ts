import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { clearSessionCookie } from '@/lib/auth';
import { requireAuth, isAuthError, auditLog } from '@/lib/rbac';
import { safeError } from '@/lib/logger';

// POST — invalidate all sessions by incrementing tokenVersion
export async function POST() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    await prisma.user.update({
      where: { id: auth.userId },
      data: { tokenVersion: { increment: 1 } },
    });

    auditLog(auth.userId, 'session:logout-all').catch(() => {});
    await clearSessionCookie();
    return NextResponse.json({ ok: true, message: 'Toutes les sessions ont ete invalidees' });
  } catch (err) {
    safeError('POST /api/auth/logout-all', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
