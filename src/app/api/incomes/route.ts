import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError, verifyOwnership } from '@/lib/rbac';
import { encrypt, decrypt } from '@/lib/crypto';
import { safeError } from '@/lib/logger';
import {
  requireFloat, requireString, optionalEnum, hasError, validationError,
  MAX_NAME_LENGTH, MAX_AMOUNT, INCOME_CATEGORIES, INCOME_FREQUENCIES,
} from '@/lib/validation';

// GET — list incomes
export async function GET() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const incomes = await prisma.income.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(incomes.map((i) => ({ ...i, label: decrypt(i.label) })));
  } catch (err) {
    safeError('GET /api/incomes', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST — create income
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { label, amount, type, frequency } = body;

    const vLabel = requireString(label, 'label', { maxLength: MAX_NAME_LENGTH });
    if (hasError(vLabel)) return validationError(vLabel.error);
    const vAmount = requireFloat(amount, 'amount', { min: 0, max: MAX_AMOUNT });
    if (hasError(vAmount)) return validationError(vAmount.error);
    const vType = optionalEnum(type, 'type', INCOME_CATEGORIES);
    if (hasError(vType)) return validationError(vType.error);
    const vFreq = optionalEnum(frequency, 'frequency', INCOME_FREQUENCIES);
    if (hasError(vFreq)) return validationError(vFreq.error);

    const income = await prisma.income.create({
      data: {
        userId: auth.userId,
        label: encrypt(vLabel.value),
        amount: vAmount.value,
        type: vType.value || 'primary',
        frequency: vFreq.value || 'monthly',
      },
    });

    return NextResponse.json({ ...income, label: decrypt(income.label) });
  } catch (err) {
    safeError('POST /api/incomes', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PUT — update income
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const ownership = await verifyOwnership('income', id, auth, true);
    if (!ownership.owned) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (data.label !== undefined) {
      const v = requireString(data.label, 'label', { maxLength: MAX_NAME_LENGTH });
      if (hasError(v)) return validationError(v.error);
      update.label = encrypt(v.value);
    }
    if (data.amount !== undefined) {
      const v = requireFloat(data.amount, 'amount', { min: 0, max: MAX_AMOUNT });
      if (hasError(v)) return validationError(v.error);
      update.amount = v.value;
    }
    if (data.type !== undefined) {
      const v = optionalEnum(data.type, 'type', INCOME_CATEGORIES);
      if (hasError(v)) return validationError(v.error);
      if (v.value) update.type = v.value;
    }
    if (data.frequency !== undefined) {
      const v = optionalEnum(data.frequency, 'frequency', INCOME_FREQUENCIES);
      if (hasError(v)) return validationError(v.error);
      if (v.value) update.frequency = v.value;
    }
    if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);

    const income = await prisma.income.update({ where: { id }, data: update });
    return NextResponse.json({ ...income, label: decrypt(income.label) });
  } catch (err) {
    safeError('PUT /api/incomes', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE — delete income
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const ownership = await verifyOwnership('income', id, auth, true);
    if (!ownership.owned) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    await prisma.income.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    safeError('DELETE /api/incomes', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
