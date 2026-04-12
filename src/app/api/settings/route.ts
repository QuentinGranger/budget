import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isAuthError } from '@/lib/rbac';
import {
  safeFloat, safeInt, optionalEnum, optionalBool, validationError,
  FINANCIAL_GOALS, COMFORT_LEVELS, DISCIPLINE_LEVELS, INCOME_TYPES,
} from '@/lib/validation';
import { safeError } from '@/lib/logger';

// PUT — upsert user settings
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const data: Record<string, unknown> = {};

    // Percentages (0-100, must sum to 100 if all provided)
    if (body.needsPercent !== undefined) {
      const n = safeFloat(body.needsPercent);
      if (n === null || n < 0 || n > 100) return validationError('needsPercent doit etre entre 0 et 100');
      data.needsPercent = n;
    }
    if (body.wantsPercent !== undefined) {
      const n = safeFloat(body.wantsPercent);
      if (n === null || n < 0 || n > 100) return validationError('wantsPercent doit etre entre 0 et 100');
      data.wantsPercent = n;
    }
    if (body.savingsPercent !== undefined) {
      const n = safeFloat(body.savingsPercent);
      if (n === null || n < 0 || n > 100) return validationError('savingsPercent doit etre entre 0 et 100');
      data.savingsPercent = n;
    }
    if (body.tolerancePercent !== undefined) {
      const n = safeFloat(body.tolerancePercent);
      if (n === null || n < 0 || n > 50) return validationError('tolerancePercent doit etre entre 0 et 50');
      data.tolerancePercent = n;
    }
    if (body.budgetStartDay !== undefined) {
      const n = safeInt(body.budgetStartDay);
      if (n === null || n < 1 || n > 28) return validationError('budgetStartDay doit etre entre 1 et 28');
      data.budgetStartDay = n;
    }
    if (body.monthlyFixedExpenses !== undefined) {
      const n = safeFloat(body.monthlyFixedExpenses);
      if (n === null || n < 0 || n > 999999) return validationError('monthlyFixedExpenses doit etre entre 0 et 999999');
      data.monthlyFixedExpenses = n;
    }
    if (body.strictMode !== undefined) data.strictMode = optionalBool(body.strictMode) ?? false;
    if (body.disciplineLevel !== undefined) {
      const v = optionalEnum(body.disciplineLevel, 'disciplineLevel', DISCIPLINE_LEVELS);
      if ('error' in v) return validationError(v.error);
      if (v.value) data.disciplineLevel = v.value;
    }
    if (body.financialGoal !== undefined) {
      const v = optionalEnum(body.financialGoal, 'financialGoal', FINANCIAL_GOALS);
      if ('error' in v) return validationError(v.error);
      if (v.value) data.financialGoal = v.value;
    }
    if (body.comfortLevel !== undefined) {
      const v = optionalEnum(body.comfortLevel, 'comfortLevel', COMFORT_LEVELS);
      if ('error' in v) return validationError(v.error);
      if (v.value) data.comfortLevel = v.value;
    }
    if (body.incomeType !== undefined) {
      const v = optionalEnum(body.incomeType, 'incomeType', INCOME_TYPES);
      if ('error' in v) return validationError(v.error);
      if (v.value) data.incomeType = v.value;
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: auth.userId },
      create: { userId: auth.userId, ...data },
      update: data,
    });

    return NextResponse.json(settings);
  } catch (err) {
    safeError('PUT /api/settings', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
