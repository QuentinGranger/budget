import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError } from '@/lib/rbac';
import {
  requireString, requireEnum, optionalString, hasError, validationError,
  PILLARS, MAX_NAME_LENGTH,
} from '@/lib/validation';
import { safeError } from '@/lib/logger';

// GET — list categories
export async function GET() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const categories = await prisma.category.findMany({
      where: { userId: auth.userId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(categories);
  } catch (err) {
    safeError('GET /api/categories', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST — create category
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();

    const vName = requireString(body.name, 'name', { maxLength: MAX_NAME_LENGTH });
    if (hasError(vName)) return validationError(vName.error);
    const vPillar = requireEnum(body.pillar, 'pillar', PILLARS);
    if (hasError(vPillar)) return validationError(vPillar.error);
    const vIcon = optionalString(body.icon, 'icon', { maxLength: 50 });
    if (hasError(vIcon)) return validationError(vIcon.error);

    const category = await prisma.category.create({
      data: {
        userId: auth.userId,
        name: vName.value,
        icon: vIcon.value || 'circle',
        pillar: vPillar.value,
        isDefault: false,
      },
    });

    return NextResponse.json(category);
  } catch (err) {
    safeError('POST /api/categories', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE — delete category
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category || category.userId !== auth.userId) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    // Check if category has transactions
    const txCount = await prisma.transaction.count({ where: { categoryId: id } });
    if (txCount > 0) {
      return NextResponse.json({ error: 'Impossible de supprimer une categorie avec des transactions' }, { status: 400 });
    }

    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    safeError('DELETE /api/categories', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
