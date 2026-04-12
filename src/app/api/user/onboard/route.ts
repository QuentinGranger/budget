import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError } from '@/lib/rbac';
import { encrypt, decrypt } from '@/lib/crypto';
import { safeError } from '@/lib/logger';
import { DEFAULT_CATEGORIES } from '@/lib/types';

// POST — complete onboarding: create settings + default categories + incomes
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    const userId = auth.userId;

    const body = await req.json();
    const { name, currency, incomes, settings } = body;

    // Update user profile
    const userData: Record<string, unknown> = { onboarded: true };
    if (name) userData.name = name;
    if (currency) userData.currency = currency;

    await prisma.user.update({ where: { id: userId }, data: userData });

    // Create settings
    if (settings) {
      await prisma.userSettings.upsert({
        where: { userId },
        create: { userId, ...settings },
        update: settings,
      });
    }

    // Create default categories
    const existingCategories = await prisma.category.count({ where: { userId } });
    if (existingCategories === 0) {
      await prisma.category.createMany({
        data: DEFAULT_CATEGORIES.map((c, i) => ({
          userId,
          name: c.name,
          icon: c.icon,
          pillar: c.pillar,
          isDefault: true,
          sortOrder: i,
        })),
      });
    }

    // Create incomes
    if (incomes && Array.isArray(incomes)) {
      for (const inc of incomes) {
        await prisma.income.create({
          data: {
            userId,
            label: encrypt(inc.label || 'Revenu'),
            amount: inc.amount || 0,
            type: inc.type || 'primary',
            frequency: inc.frequency || 'monthly',
          },
        });
      }
    }

    // Return full user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        incomes: { orderBy: { createdAt: 'desc' } },
        categories: { orderBy: { sortOrder: 'asc' } },
        goals: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    // Strip sensitive fields before returning
    const { passwordHash, tokenVersion, failedLoginAttempts, lockedUntil, resetToken, resetTokenExpiry, emailVerifyToken, totpSecret, emailHash, ...safe } = user as unknown as Record<string, unknown>;
    void passwordHash; void tokenVersion; void failedLoginAttempts; void lockedUntil; void resetToken; void resetTokenExpiry; void emailVerifyToken; void totpSecret; void emailHash;
    if (typeof safe.email === 'string') safe.email = decrypt(safe.email as string);
    if (Array.isArray(safe.incomes)) {
      safe.incomes = (safe.incomes as Record<string, unknown>[]).map((i) => ({
        ...i,
        label: typeof i.label === 'string' ? decrypt(i.label) : i.label,
      }));
    }

    return NextResponse.json(safe);
  } catch (err) {
    safeError('POST /api/user/onboard', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
