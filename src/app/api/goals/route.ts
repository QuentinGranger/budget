import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError, verifyOwnership } from '@/lib/rbac';
import {
  requireFloat, requireString, requireDate, optionalString, optionalEnum,
  hasError, validationError, safeFloat,
  PILLARS, MAX_NAME_LENGTH, MAX_AMOUNT,
} from '@/lib/validation';
import { safeError } from '@/lib/logger';

// GET — list goals
export async function GET() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const goals = await prisma.goal.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(goals);
  } catch (err) {
    safeError('GET /api/goals', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST — create goal
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { name, targetAmount, targetDate, pillar, icon, color } = body;

    const vName = requireString(name, 'name', { maxLength: MAX_NAME_LENGTH });
    if (hasError(vName)) return validationError(vName.error);
    const vAmount = requireFloat(targetAmount, 'targetAmount', { min: 0.01, max: MAX_AMOUNT });
    if (hasError(vAmount)) return validationError(vAmount.error);
    const vDate = requireDate(targetDate, 'targetDate');
    if (hasError(vDate)) return validationError(vDate.error);
    const vPillar = optionalEnum(pillar, 'pillar', PILLARS);
    if (hasError(vPillar)) return validationError(vPillar.error);
    const vIcon = optionalString(icon, 'icon', { maxLength: 50 });
    if (hasError(vIcon)) return validationError(vIcon.error);
    const vColor = optionalString(color, 'color', { maxLength: 20 });
    if (hasError(vColor)) return validationError(vColor.error);

    const goal = await prisma.goal.create({
      data: {
        userId: auth.userId,
        name: vName.value,
        targetAmount: vAmount.value,
        targetDate: vDate.value,
        pillar: vPillar.value || 'savings',
        icon: vIcon.value || 'target',
        color: vColor.value || '#c9a84c',
      },
    });

    return NextResponse.json(goal);
  } catch (err) {
    safeError('POST /api/goals', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PUT — update goal
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const ownership = await verifyOwnership('goal', id, auth, true);
    if (!ownership.owned) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const v = requireString(data.name, 'name', { maxLength: MAX_NAME_LENGTH });
      if (hasError(v)) return validationError(v.error);
      update.name = v.value;
    }
    if (data.targetAmount !== undefined) {
      const v = requireFloat(data.targetAmount, 'targetAmount', { min: 0.01, max: MAX_AMOUNT });
      if (hasError(v)) return validationError(v.error);
      update.targetAmount = v.value;
    }
    if (data.currentAmount !== undefined) {
      const n = safeFloat(data.currentAmount);
      if (n === null || n < 0) return validationError('currentAmount doit etre un nombre >= 0');
      update.currentAmount = n;
    }
    if (data.targetDate !== undefined) {
      const v = requireDate(data.targetDate, 'targetDate');
      if (hasError(v)) return validationError(v.error);
      update.targetDate = v.value;
    }
    if (data.pillar !== undefined) {
      const v = optionalEnum(data.pillar, 'pillar', PILLARS);
      if (hasError(v)) return validationError(v.error);
      if (v.value) update.pillar = v.value;
    }
    if (data.icon !== undefined) update.icon = String(data.icon).slice(0, 50);
    if (data.color !== undefined) update.color = String(data.color).slice(0, 20);

    const goal = await prisma.goal.update({ where: { id }, data: update });
    return NextResponse.json(goal);
  } catch (err) {
    safeError('PUT /api/goals', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE — delete goal
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const ownership = await verifyOwnership('goal', id, auth, true);
    if (!ownership.owned) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    safeError('DELETE /api/goals', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
