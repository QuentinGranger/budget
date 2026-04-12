import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError, verifyOwnership } from '@/lib/rbac';
import { encrypt, decrypt } from '@/lib/crypto';
import { safeError } from '@/lib/logger';
import {
  requireFloat, requireString, requireEnum, requireDate,
  optionalString, optionalBool, hasError, validationError,
  PILLARS, MAX_DESCRIPTION_LENGTH, MAX_NOTE_LENGTH, MAX_AMOUNT,
} from '@/lib/validation';

// GET — list transactions for current user
export async function GET() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const transactions = await prisma.transaction.findMany({
      where: { userId: auth.userId },
      include: { category: true },
      orderBy: { date: 'desc' },
    });

    const decrypted = transactions.map((t) => ({
      ...t,
      description: decrypt(t.description),
      note: decrypt(t.note),
    }));

    return NextResponse.json(decrypted);
  } catch (err) {
    safeError('GET /api/transactions', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST — create transaction
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { categoryId, amount, date, description, note, pillar, isRecurring } = body;

    const vCatId = requireString(categoryId, 'categoryId', { maxLength: 100 });
    if (hasError(vCatId)) return validationError(vCatId.error);
    const vAmount = requireFloat(amount, 'amount', { min: 0.01, max: MAX_AMOUNT });
    if (hasError(vAmount)) return validationError(vAmount.error);
    const vDate = requireDate(date, 'date');
    if (hasError(vDate)) return validationError(vDate.error);
    const vPillar = requireEnum(pillar, 'pillar', PILLARS);
    if (hasError(vPillar)) return validationError(vPillar.error);
    const vDesc = optionalString(description, 'description', { maxLength: MAX_DESCRIPTION_LENGTH });
    if (hasError(vDesc)) return validationError(vDesc.error);
    const vNote = optionalString(note, 'note', { maxLength: MAX_NOTE_LENGTH });
    if (hasError(vNote)) return validationError(vNote.error);

    const category = await prisma.category.findUnique({ where: { id: vCatId.value } });
    if (!category) {
      return NextResponse.json({ error: 'Categorie introuvable' }, { status: 400 });
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId: auth.userId,
        categoryId: vCatId.value,
        amount: vAmount.value,
        date: vDate.value,
        description: encrypt(vDesc.value || ''),
        note: encrypt(vNote.value || ''),
        pillar: vPillar.value,
        isRecurring: optionalBool(isRecurring) || false,
      },
      include: { category: true },
    });

    return NextResponse.json({
      ...transaction,
      description: decrypt(transaction.description),
      note: decrypt(transaction.note),
    });
  } catch (err) {
    safeError('POST /api/transactions', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PUT — update transaction
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { id, ...raw } = body;

    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const ownership = await verifyOwnership('transaction', id, auth, true);
    if (!ownership.owned) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (raw.description !== undefined) {
      const v = optionalString(raw.description, 'description', { maxLength: MAX_DESCRIPTION_LENGTH });
      if (hasError(v)) return validationError(v.error);
      data.description = encrypt(v.value || '');
    }
    if (raw.note !== undefined) {
      const v = optionalString(raw.note, 'note', { maxLength: MAX_NOTE_LENGTH });
      if (hasError(v)) return validationError(v.error);
      data.note = encrypt(v.value || '');
    }
    if (raw.date !== undefined) {
      const v = requireDate(raw.date, 'date');
      if (hasError(v)) return validationError(v.error);
      data.date = v.value;
    }
    if (raw.amount !== undefined) {
      const v = requireFloat(raw.amount, 'amount', { min: 0.01, max: MAX_AMOUNT });
      if (hasError(v)) return validationError(v.error);
      data.amount = v.value;
    }
    if (raw.pillar !== undefined) {
      const v = requireEnum(raw.pillar, 'pillar', PILLARS);
      if (hasError(v)) return validationError(v.error);
      data.pillar = v.value;
    }
    if (raw.categoryId !== undefined) data.categoryId = raw.categoryId;
    if (raw.isRecurring !== undefined) data.isRecurring = Boolean(raw.isRecurring);

    const transaction = await prisma.transaction.update({
      where: { id },
      data,
      include: { category: true },
    });

    return NextResponse.json({
      ...transaction,
      description: decrypt(transaction.description),
      note: decrypt(transaction.note),
    });
  } catch (err) {
    safeError('PUT /api/transactions', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE — delete transaction
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const ownership = await verifyOwnership('transaction', id, auth, true);
    if (!ownership.owned) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    await prisma.transaction.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    safeError('DELETE /api/transactions', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
