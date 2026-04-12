import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError, auditLog } from '@/lib/rbac';
import { encrypt, decrypt, hmacHash } from '@/lib/crypto';
import { optionalString, optionalEnum, hasError, validationError, CURRENCIES, MAX_NAME_LENGTH } from '@/lib/validation';
import { safeError } from '@/lib/logger';

// Strips sensitive fields from user object
function safeUser(user: Record<string, unknown>) {
  const { passwordHash, tokenVersion, failedLoginAttempts, lockedUntil, resetToken, resetTokenExpiry, emailVerifyToken, totpSecret, emailHash, ...safe } = user;
  void passwordHash; void tokenVersion; void failedLoginAttempts; void lockedUntil; void resetToken; void resetTokenExpiry; void emailVerifyToken; void totpSecret; void emailHash;
  // Decrypt email for client
  if (typeof safe.email === 'string') {
    safe.email = decrypt(safe.email as string);
  }
  // Decrypt income labels
  if (Array.isArray(safe.incomes)) {
    safe.incomes = (safe.incomes as Record<string, unknown>[]).map((i) => ({
      ...i,
      label: typeof i.label === 'string' ? decrypt(i.label) : i.label,
    }));
  }
  return safe;
}

// GET — fetch authenticated user with related data
export async function GET() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        settings: true,
        incomes: { orderBy: { createdAt: 'desc' } },
        categories: { orderBy: { sortOrder: 'asc' } },
        goals: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) return NextResponse.json(null);
    return NextResponse.json(safeUser(user as unknown as Record<string, unknown>));
  } catch (err) {
    safeError('GET /api/user', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PUT — update user profile
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();

    // Strip sensitive fields — only allow name, currency, email
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const v = optionalString(body.name, 'name', { maxLength: MAX_NAME_LENGTH });
      if (hasError(v)) return validationError(v.error);
      if (v.value) updateData.name = v.value;
    }
    if (body.currency !== undefined) {
      const v = optionalEnum(body.currency, 'currency', CURRENCIES);
      if (hasError(v)) return validationError(v.error);
      if (v.value) updateData.currency = v.value;
    }

    // If email is being updated, encrypt and update hash
    if (body.email) {
      const normalizedEmail = String(body.email).toLowerCase().trim();
      if (normalizedEmail.length > 254 || !/^[^@]+@[^@]+\.[^@]+$/.test(normalizedEmail)) {
        return validationError('Format email invalide');
      }
      const newHash = hmacHash(normalizedEmail);

      // Check uniqueness
      const existing = await prisma.user.findUnique({ where: { emailHash: newHash } });
      if (existing && existing.id !== auth.userId) {
        return NextResponse.json({ error: 'Cet email est deja utilise' }, { status: 409 });
      }

      updateData.email = encrypt(normalizedEmail);
      updateData.emailHash = newHash;
    }

    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: updateData,
      include: {
        settings: true,
        incomes: { orderBy: { createdAt: 'desc' } },
        categories: { orderBy: { sortOrder: 'asc' } },
        goals: { orderBy: { createdAt: 'desc' } },
      },
    });

    return NextResponse.json(safeUser(updated as unknown as Record<string, unknown>));
  } catch (err) {
    safeError('PUT /api/user', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE — delete account
export async function DELETE() {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    auditLog(auth.userId, 'account:deleted').catch(() => {});
    await prisma.user.delete({ where: { id: auth.userId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    safeError('DELETE /api/user', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
