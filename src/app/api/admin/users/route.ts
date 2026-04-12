import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, isAuthError, auditLog } from '@/lib/rbac';
import { decrypt } from '@/lib/crypto';
import { safeError } from '@/lib/logger';
import { headers } from 'next/headers';

// GET — list users (support+)
export async function GET() {
  try {
    const auth = await requireRole('support');
    if (isAuthError(auth)) return auth;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        onboarded: true,
        emailVerified: true,
        totpEnabled: true,
        createdAt: true,
        lastActivity: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const decryptedUsers = users.map((u) => ({
      ...u,
      email: decrypt(u.email),
    }));

    const hdrs = await headers();
    const ip = hdrs.get('x-forwarded-for') || undefined;
    await auditLog(auth.userId, 'admin.view_users', undefined, { count: users.length }, ip);

    return NextResponse.json(decryptedUsers);
  } catch (err) {
    safeError('GET /api/admin/users', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE — delete user (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireRole('admin');
    if (isAuthError(auth)) return auth;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    if (id === auth.userId) {
      return NextResponse.json({ error: 'Impossible de supprimer votre propre compte via admin' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    await prisma.user.delete({ where: { id } });

    const hdrs = await headers();
    const ip = hdrs.get('x-forwarded-for') || undefined;
    await auditLog(auth.userId, 'admin.delete_user', id, { name: user.name }, ip);

    return NextResponse.json({ ok: true });
  } catch (err) {
    safeError('DELETE /api/admin/users', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
