import type { SmartSplitInput, SmartSplitResult, Pillar } from './types';
import { t as translate } from './i18n/translations';
import type { Locale } from './i18n/translations';

// ============================================================================
// Budget Engine — 50/30/20 Rule with Smart Adaptations
// ============================================================================

// ---- Types ----

export interface BudgetSnapshot {
  totalIncome: number;
  totalSpent: number;
  totalRemaining: number;
  monthlyFixedExpenses: number;
  resteAVivre: number;
  envelopes: EnvelopeState[];
  pillars: Record<Pillar, PillarState>;
  healthScore: number;
  healthLabel: string;
  statusMessage: string;
  statusTone: 'positive' | 'neutral' | 'caution' | 'warning';
  alerts: Alert[];
  recommendations: Recommendation[];
  intelligence: IntelligenceData;
  daysLeft: number;
  daysElapsed: number;
  daysInMonth: number;
  monthProgress: number;
}

export interface EnvelopeState {
  pillar: Pillar;
  label: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percent: number;
}

export interface PillarState {
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  targetPercent: number;
}

export interface Alert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  pillar?: Pillar;
  message: string;
}

export interface Recommendation {
  id: string;
  type: 'tip' | 'action';
  message: string;
  priority: number;
}

export interface IntelligenceData {
  velocity: VelocityData | null;
  categoryInsights: CategoryInsight[];
  elasticity: ElasticityTransfer[];
  goalSavings: GoalSavingsAnalysis | null;
}

export interface VelocityData {
  dailyAverage: number;
  projectedMonthTotal: number;
  budgetTotal: number;
  onTrack: boolean;
  daysElapsed: number;
  daysInMonth: number;
  pillarVelocity: Record<Pillar, { daily: number; projected: number; budget: number }>;
}

export interface CategoryInsight {
  categoryName: string;
  pillar: Pillar;
  spent: number;
  percentOfPillar: number;
  trend: 'up' | 'down' | 'stable';
  icon: string;
}

export interface ElasticityTransfer {
  from: Pillar;
  to: Pillar;
  amount: number;
  reason: string;
}

export interface GoalSavingsAnalysis {
  monthlyRequired: number;
  currentSavingsRate: number;
  onTrack: boolean;
  gap: number;
  goalName: string;
}

// ---- Transaction type for engine ----

export interface EngineTransaction {
  amount: number;
  date: string | Date;
  pillar: string;
  categoryId: string;
  category?: { name: string; icon: string; pillar: string };
}

export interface EngineGoal {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | Date;
}

export interface EngineSettings {
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
  tolerancePercent: number;
  monthlyFixedExpenses: number;
  financialGoal?: string;
  comfortLevel?: string;
  incomeType?: string;
  disciplineLevel?: string;
}

// ---- Smart Split ----
// Algorithme intelligent basé sur le "reste à vivre", les tranches de revenus,
// la pression du loyer, le ratio d'effort, le taux d'endettement cible,
// le fonds d'urgence, et le profil comportemental de l'utilisateur.

export function computeSmartSplit(
  input: SmartSplitInput,
  locale: Locale = 'fr',
  fmtFn?: (n: number) => string,
): SmartSplitResult {
  const { totalIncome, monthlyFixedExpenses, financialGoal, comfortLevel, incomeType, disciplineLevel } = input;
  const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
  const f = fmtFn || ((n: number) => `${Math.round(n)}€`);
  const reasoning: string[] = [];
  const rent = monthlyFixedExpenses; // loyer

  if (totalIncome <= 0) {
    return {
      needs: 50, wants: 30, savings: 20,
      reasoning: ['Aucun revenu renseigne — repartition standard 50/30/20 appliquee.'],
      isRealistic: false, resteAVivre: 0, incomeProfile: 'low', pressureLevel: 'critical',
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // 1. METRIQUES FONDAMENTALES
  // ══════════════════════════════════════════════════════════════════════

  const resteAVivre = totalIncome - rent;
  const rentRatio = rent / totalIncome; // taux d'effort logement

  // Profil de revenu (tranches nettes, base SMIC ~1400€)
  const incomeProfile: 'low' | 'medium' | 'high' =
    totalIncome < 2100 ? 'low' : totalIncome < 4200 ? 'medium' : 'high';

  // Pression loyer (norme bancaire : un loyer > 33% est considéré "en tension")
  const pressureLevel: 'low' | 'moderate' | 'high' | 'critical' =
    rentRatio < 0.25 ? 'low' : rentRatio < 0.33 ? 'moderate' : rentRatio < 0.45 ? 'high' : 'critical';

  // ══════════════════════════════════════════════════════════════════════
  // 2. TAUX D'EFFORT LOGEMENT (norme française : max 33%)
  // ══════════════════════════════════════════════════════════════════════

  const effortPercent = Math.round(rentRatio * 100);
  if (effortPercent > 0) {
    if (rentRatio <= 0.25) {
      reasoning.push(t('ss.effortExcellent', { pct: effortPercent }));
    } else if (rentRatio <= 0.33) {
      reasoning.push(t('ss.effortNorm', { pct: effortPercent }));
    } else if (rentRatio <= 0.45) {
      reasoning.push(t('ss.effortAbove', { pct: effortPercent }));
    } else {
      reasoning.push(t('ss.effortCritical', { pct: effortPercent, rent: f(rent) }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. ESTIMATION DES BESOINS INCOMPRESSIBLES
  // ══════════════════════════════════════════════════════════════════════

  // Loyer + estimation des dépenses essentielles (courses, transport, santé, énergie)
  // Estimation : 250-450€ pour un foyer selon le profil de revenu
  const essentialExpensesEstimate =
    incomeProfile === 'low' ? 250 : incomeProfile === 'medium' ? 350 : 450;
  const totalNeeds = rent + essentialExpensesEstimate;
  const needsFromIncome = Math.ceil((totalNeeds / totalIncome) * 100);

  reasoning.push(
    t('ss.needsEstimate', { rent: f(rent), essential: f(essentialExpensesEstimate), total: f(totalNeeds) })
  );

  // ══════════════════════════════════════════════════════════════════════
  // 4. CAPACITE D'EPARGNE PROGRESSIVE
  // ══════════════════════════════════════════════════════════════════════

  // Base savings: plus le revenu est élevé et le loyer léger, plus on peut épargner
  let baseSavings: number;
  if (incomeProfile === 'low') {
    baseSavings = pressureLevel === 'critical' ? 5 : pressureLevel === 'high' ? 8 : 12;
  } else if (incomeProfile === 'medium') {
    baseSavings = pressureLevel === 'critical' ? 8 : pressureLevel === 'high' ? 15 : 20;
  } else {
    baseSavings = pressureLevel === 'critical' ? 12 : pressureLevel === 'high' ? 20 : 28;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. CONSTRUCTION DE LA REPARTITION
  // ══════════════════════════════════════════════════════════════════════

  let needs = Math.max(needsFromIncome, 35);
  let savings = baseSavings;
  let wants = 100 - needs - savings;

  // Si wants trop comprimé, on rééquilibre
  if (wants < 10) {
    const deficit = 10 - wants;
    wants = 10;
    // Prendre d'abord sur savings, puis needs si nécessaire
    if (savings > 5 + deficit) {
      savings -= deficit;
    } else {
      const fromSavings = Math.max(0, savings - 5);
      savings -= fromSavings;
      needs -= (deficit - fromSavings);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. OBJECTIF FINANCIER (impact proportionnel à la marge disponible)
  // ══════════════════════════════════════════════════════════════════════

  const flexRoom = Math.max(0, wants - 10); // marge compressible sur les envies

  if (financialGoal === 'save') {
    // Épargne renforcée : on transfère 30-40% de la marge envies → épargne
    const boost = Math.min(Math.round(flexRoom * 0.40), 12);
    savings += boost;
    wants -= boost;
    if (boost > 0) {
      reasoning.push(t('ss.goalSave', { boost, target: f(totalIncome * (savings / 100)) }));
    }
  } else if (financialGoal === 'debt') {
    // Remboursement dette : agressif, 50-60% de la marge → épargne/remboursement
    const boost = Math.min(Math.round(flexRoom * 0.55), 15);
    savings += boost;
    wants -= boost;
    if (boost > 0) {
      reasoning.push(t('ss.goalDebt', { boost }));
    }
    // En mode dette, le needs absorbe aussi une part si la marge le permet
    if (incomeProfile !== 'low' && needs > needsFromIncome + 3) {
      const extraBoost = Math.min(3, needs - needsFromIncome);
      needs -= extraBoost;
      savings += extraBoost;
      reasoning.push(t('ss.goalDebtExtra', { boost: extraBoost }));
    }
  } else {
    reasoning.push(t('ss.goalControl'));
  }

  // ══════════════════════════════════════════════════════════════════════
  // 7. TYPE DE REVENU (stable / variable / mixte)
  // ══════════════════════════════════════════════════════════════════════

  if (incomeType === 'variable') {
    const safetyBoost = incomeProfile === 'low' ? 5 : incomeProfile === 'medium' ? 4 : 3;
    const actualBoost = Math.min(safetyBoost, Math.max(0, wants - 10));
    if (actualBoost > 0) {
      savings += actualBoost;
      wants -= actualBoost;
    }
    const emergencyTarget = rent > 0 ? rent * 6 : totalIncome * 3;
    reasoning.push(t('ss.incomeVariable', { boost: actualBoost, target: f(emergencyTarget) }));
  } else if (incomeType === 'mixed') {
    const actualBoost = Math.min(2, Math.max(0, wants - 10));
    if (actualBoost > 0) {
      savings += actualBoost;
      wants -= actualBoost;
    }
    const emergencyTarget = rent > 0 ? rent * 4 : totalIncome * 2;
    reasoning.push(t('ss.incomeMixed', { boost: actualBoost, target: f(emergencyTarget) }));
  } else {
    if (rent > 0) {
      const emergencyTarget = rent * 3;
      reasoning.push(t('ss.incomeStable', { target: f(emergencyTarget) }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 8. CONFORT + DISCIPLINE (modulateurs fins)
  // ══════════════════════════════════════════════════════════════════════

  if (comfortLevel === 'tight') {
    const shift = Math.min(Math.round(wants * 0.18), 6);
    wants -= shift;
    savings += shift;
    if (shift > 0) {
      reasoning.push(t('ss.comfortTight', { shift }));
    }
  } else if (comfortLevel === 'spacious') {
    const shift = Math.min(Math.round(savings * 0.15), 5);
    if (savings - shift >= 5) {
      savings -= shift;
      wants += shift;
      if (shift > 0) {
        reasoning.push(t('ss.comfortSpacious', { shift }));
      }
    }
  }

  if (disciplineLevel === 'strict') {
    const shift = Math.min(3, Math.max(0, wants - 10));
    savings += shift;
    wants -= shift;
    if (shift > 0) {
      reasoning.push(t('ss.disciplineStrict', { shift }));
    }
  } else if (disciplineLevel === 'relaxed') {
    const shift = Math.min(2, Math.max(0, savings - 5));
    savings -= shift;
    wants += shift;
    if (shift > 0) {
      reasoning.push(t('ss.disciplineRelaxed', { shift }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 9. ANALYSE RATIO ENVIES/REVENU (réalisme)
  // ══════════════════════════════════════════════════════════════════════

  const wantsAmount = totalIncome * (wants / 100);
  if (wantsAmount < 100 && incomeProfile !== 'low') {
    reasoning.push(t('ss.wantsTight', { amount: f(wantsAmount) }));
  }

  // ══════════════════════════════════════════════════════════════════════
  // 10. GARDE-FOUS + NORMALISATION
  // ══════════════════════════════════════════════════════════════════════

  savings = Math.max(5, savings);
  wants = Math.max(8, wants);
  needs = Math.max(30, Math.min(needs, 80));

  const total = needs + wants + savings;
  needs = Math.round((needs / total) * 100);
  wants = Math.round((wants / total) * 100);
  savings = 100 - needs - wants;

  // ══════════════════════════════════════════════════════════════════════
  // 11. VIABILITE + SYNTHESE
  // ══════════════════════════════════════════════════════════════════════

  const isRealistic = needs <= 70 && savings >= 5 && resteAVivre > 0;

  if (!isRealistic && resteAVivre <= 0) {
    reasoning.push(t('ss.unrealisticRent', { rent: f(rent) }));
  } else if (!isRealistic) {
    reasoning.push(t('ss.unrealisticGeneral'));
  }

  // Reste à vivre contextuel
  if (resteAVivre > 0) {
    const ravPerDay = resteAVivre / 30;
    const savingsTarget = Math.round(totalIncome * (savings / 100));
    const wantsTarget = Math.round(totalIncome * (wants / 100));
    reasoning.push(
      t('ss.ravSummary', { rav: f(resteAVivre), ravPerDay: f(ravPerDay), wants: f(wantsTarget), savings: f(savingsTarget) })
    );
  }

  return { needs, wants, savings, reasoning, isRealistic, resteAVivre, incomeProfile, pressureLevel };
}

// ---- Budget Snapshot Computation ----

export function computeBudgetSnapshot(
  totalIncome: number,
  settings: EngineSettings,
  transactions: EngineTransaction[],
  goals: EngineGoal[],
  currentMonth?: Date,
  locale: Locale = 'fr',
  fmt?: (n: number) => string,
): BudgetSnapshot {
  const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
  const f = fmt || ((n: number) => `${Math.round(n)}€`);
  const now = currentMonth || new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = now.getDate();

  const monthTxns = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const { needsPercent, wantsPercent, savingsPercent, monthlyFixedExpenses } = settings;

  const pillarBudgets: Record<Pillar, number> = {
    needs: totalIncome * (needsPercent / 100),
    wants: totalIncome * (wantsPercent / 100),
    savings: totalIncome * (savingsPercent / 100),
  };

  const pillarSpent: Record<Pillar, number> = { needs: 0, wants: 0, savings: 0 };

  // Loyer is now injected as a synthetic transaction by the store,
  // so it flows through the normal transaction pipeline (no phantom).

  for (const t of monthTxns) {
    const p = t.pillar as Pillar;
    if (pillarSpent[p] !== undefined) {
      pillarSpent[p] += t.amount;
    }
  }

  const pillars: Record<Pillar, PillarState> = {} as Record<Pillar, PillarState>;
  for (const p of ['needs', 'wants', 'savings'] as Pillar[]) {
    pillars[p] = {
      budgeted: pillarBudgets[p],
      spent: pillarSpent[p],
      remaining: pillarBudgets[p] - pillarSpent[p],
      percentUsed: pillarBudgets[p] > 0 ? (pillarSpent[p] / pillarBudgets[p]) * 100 : 0,
      targetPercent: p === 'needs' ? needsPercent : p === 'wants' ? wantsPercent : savingsPercent,
    };
  }

  const envelopes: EnvelopeState[] = (['needs', 'wants', 'savings'] as Pillar[]).map((p) => ({
    pillar: p,
    label: t(`e.${p}`),
    budgeted: pillarBudgets[p],
    spent: pillarSpent[p],
    remaining: pillarBudgets[p] - pillarSpent[p],
    percent: pillarBudgets[p] > 0 ? (pillarSpent[p] / pillarBudgets[p]) * 100 : 0,
  }));

  // ── Core metrics ──
  const totalSpent = pillarSpent.needs + pillarSpent.wants + pillarSpent.savings;
  const totalRemaining = totalIncome - totalSpent;
  const resteAVivre = totalIncome - monthlyFixedExpenses;
  const monthProgress = daysInMonth > 0 ? dayOfMonth / daysInMonth : 0;
  const daysLeft = daysInMonth - dayOfMonth;

  // ── Health score (0-100) — nuanced multi-factor ──
  let healthScore = 100;

  if (totalIncome > 0) {
    // Exclude fixed expenses from pace ratio — loyer is committed from day 1, not a "spending pace" issue
    const variableSpent = totalSpent - monthlyFixedExpenses;
    const variableIncome = totalIncome - monthlyFixedExpenses;
    const spendRatio = variableIncome > 0 ? variableSpent / variableIncome : 0;
    const expectedSpendRatio = monthProgress;

    // Pace scoring: are you spending faster than the month progresses?
    const paceRatio = expectedSpendRatio > 0 ? spendRatio / expectedSpendRatio : 0;
    if (paceRatio > 1.4) healthScore -= 25;
    else if (paceRatio > 1.2) healthScore -= 15;
    else if (paceRatio > 1.05) healthScore -= 5;
    else if (paceRatio <= 0.9) healthScore += 5; // under pace = bonus

    // Pillar adherence — is spending aligned with the 50/30/20 split?
    // For needs: loyer is expected, so only penalize if variable needs also overshoot
    for (const p of ['needs', 'wants'] as Pillar[]) {
      const pu = pillars[p].percentUsed;
      if (pu > 110) healthScore -= 20;
      else if (pu > 100) healthScore -= 10;
      else if (pu > 90) healthScore -= 3;
      else if (pu < 70) healthScore += 3; // well under = bonus
    }

    // Budget exceeded globally
    if (spendRatio > 1) healthScore -= 25;

    // Savings progress — reward saving early
    const savingsProgress = pillarBudgets.savings > 0 ? pillarSpent.savings / pillarBudgets.savings : 0;
    if (savingsProgress >= 1) healthScore += 10;
    else if (savingsProgress >= monthProgress) healthScore += 5;
    else if (savingsProgress < monthProgress * 0.3 && monthProgress > 0.4) healthScore -= 5;
  }
  healthScore = Math.max(0, Math.min(100, healthScore));

  // ── Health label + status message ──
  let healthLabel: string;
  let statusMessage: string;
  let statusTone: 'positive' | 'neutral' | 'caution' | 'warning';

  if (monthTxns.length === 0) {
    healthLabel = t('e.newMonth');
    statusMessage = monthlyFixedExpenses > 0
      ? t('e.statusNewMonthRent', { rent: f(monthlyFixedExpenses) })
      : t('e.statusNewMonth');
    statusTone = 'neutral';
  } else if (healthScore >= 80) {
    healthLabel = t('e.excellent');
    statusMessage = daysLeft <= 5
      ? t('e.statusExcellentEnd')
      : t('e.statusExcellent');
    statusTone = 'positive';
  } else if (healthScore >= 60) {
    healthLabel = t('e.balanced');
    statusMessage = t('e.statusBalanced');
    statusTone = 'neutral';
  } else if (healthScore >= 40) {
    healthLabel = t('e.caution');
    statusMessage = t('e.statusCaution');
    statusTone = 'caution';
  } else {
    healthLabel = t('e.warning');
    statusMessage = t('e.statusWarning');
    statusTone = 'warning';
  }

  // ── Alerts — premium tone, non-alarming ──
  const alerts: Alert[] = [];
  const tolerance = settings.tolerancePercent || 5;

  for (const p of ['needs', 'wants'] as Pillar[]) {
    const label = t(`e.${p}`);
    const pu = pillars[p].percentUsed;
    const remaining = pillars[p].remaining;

    if (pu > 100) {
      const overAmount = pillars[p].spent - pillars[p].budgeted;
      alerts.push({
        id: `over-${p}`,
        type: 'danger',
        pillar: p,
        message: t('e.alertOver', { label, amount: f(overAmount) }),
      });
    } else if (pu > 100 - tolerance) {
      alerts.push({
        id: `warn-${p}`,
        type: 'warning',
        pillar: p,
        message: t('e.alertWarn', { label, remaining: f(remaining), days: daysLeft }),
      });
    } else if (pu > 75 && monthProgress < 0.6) {
      alerts.push({
        id: `pace-${p}`,
        type: 'info',
        pillar: p,
        message: t('e.alertPace', { label, pct: Math.round(pu) }),
      });
    }
  }

  // Savings encouragement
  if (pillarSpent.savings >= pillarBudgets.savings && pillarBudgets.savings > 0) {
    alerts.push({
      id: 'savings-done',
      type: 'info',
      message: t('e.alertSavingsDone'),
    });
  }

  // ── Recommendations — intelligent, actionable, calm ──
  const recommendations: Recommendation[] = [];

  // Velocity-based
  if (pillars.wants.percentUsed > 75 && monthProgress < 0.65) {
    const wantsDaily = daysLeft > 0 ? pillars.wants.remaining / daysLeft : 0;
    recommendations.push({
      id: 'pace-wants',
      type: 'action',
      message: wantsDaily > 0
        ? t('e.recoWantsDaily', { daily: f(wantsDaily) })
        : t('e.recoWantsEmpty'),
      priority: 1,
    });
  }

  // Savings nudge
  if (pillarSpent.savings < pillarBudgets.savings * 0.5 && monthProgress > 0.5) {
    const savingsGap = pillarBudgets.savings - pillarSpent.savings;
    recommendations.push({
      id: 'savings-nudge',
      type: 'tip',
      message: t('e.recoSavingsNudge', { gap: f(savingsGap) }),
      priority: 2,
    });
  }

  // End of month surplus
  if (totalRemaining > totalIncome * 0.15 && monthProgress > 0.7) {
    recommendations.push({
      id: 'surplus',
      type: 'tip',
      message: t('e.recoSurplus', { amount: f(totalRemaining) }),
      priority: 3,
    });
  }

  // Needs too high — structural advice
  if (pillars.needs.percentUsed > 100 && monthProgress > 0.5) {
    recommendations.push({
      id: 'needs-high',
      type: 'action',
      message: t('e.recoNeedsHigh'),
      priority: 1,
    });
  }

  // Goals progress
  const goalSavings = computeGoalSavings(goals, pillarSpent.savings, pillarBudgets.savings);
  if (goalSavings && !goalSavings.onTrack && goalSavings.gap > 0) {
    recommendations.push({
      id: 'goal-gap',
      type: 'tip',
      message: t('e.recoGoalGap', { name: goalSavings.goalName, gap: f(goalSavings.gap) }),
      priority: 2,
    });
  } else if (goalSavings && goalSavings.onTrack) {
    recommendations.push({
      id: 'goal-track',
      type: 'tip',
      message: t('e.recoGoalTrack', { name: goalSavings.goalName }),
      priority: 4,
    });
  }

  // Daily budget insight
  if (daysLeft > 0 && totalRemaining > 0) {
    const dailyBudget = totalRemaining / daysLeft;
    recommendations.push({
      id: 'daily-budget',
      type: 'tip',
      message: t('e.recoDailyBudget', { daily: f(dailyBudget), days: daysLeft }),
      priority: 3,
    });
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  // ── Intelligence ──
  const velocity = computeVelocity(monthTxns, pillarBudgets, dayOfMonth, daysInMonth);
  const categoryInsights = computeCategoryInsights(monthTxns, pillarSpent);
  const elasticity = computeElasticity(
    pillars,
    tolerance,
    t('e.elasticNeedsToWants'),
    t('e.elasticWantsToNeeds'),
  );

  return {
    totalIncome,
    totalSpent,
    totalRemaining,
    monthlyFixedExpenses,
    resteAVivre,
    envelopes,
    pillars,
    healthScore,
    healthLabel,
    statusMessage,
    statusTone,
    alerts,
    recommendations,
    intelligence: { velocity, categoryInsights, elasticity, goalSavings },
    daysLeft,
    daysElapsed: dayOfMonth,
    daysInMonth,
    monthProgress,
  };
}

// ---- Intelligence Modules ----

function computeVelocity(
  transactions: EngineTransaction[],
  pillarBudgets: Record<Pillar, number>,
  daysElapsed: number,
  daysInMonth: number
): VelocityData | null {
  if (daysElapsed < 1) return null;

  const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const dailyAverage = totalSpent / daysElapsed;
  const projectedMonthTotal = dailyAverage * daysInMonth;
  const budgetTotal = pillarBudgets.needs + pillarBudgets.wants + pillarBudgets.savings;

  const pillarVelocity = {} as Record<Pillar, { daily: number; projected: number; budget: number }>;
  for (const p of ['needs', 'wants', 'savings'] as Pillar[]) {
    const pSpent = transactions.filter((t) => t.pillar === p).reduce((s, t) => s + t.amount, 0);
    const daily = pSpent / daysElapsed;
    pillarVelocity[p] = {
      daily,
      projected: daily * daysInMonth,
      budget: pillarBudgets[p],
    };
  }

  return {
    dailyAverage,
    projectedMonthTotal,
    budgetTotal,
    onTrack: projectedMonthTotal <= budgetTotal,
    daysElapsed,
    daysInMonth,
    pillarVelocity,
  };
}

function computeCategoryInsights(
  transactions: EngineTransaction[],
  pillarSpent: Record<Pillar, number>
): CategoryInsight[] {
  const catMap = new Map<string, { name: string; pillar: Pillar; spent: number; icon: string }>();

  for (const t of transactions) {
    const key = t.categoryId;
    const existing = catMap.get(key);
    if (existing) {
      existing.spent += t.amount;
    } else {
      catMap.set(key, {
        name: t.category?.name || 'Autre',
        pillar: t.pillar as Pillar,
        spent: t.amount,
        icon: t.category?.icon || 'circle',
      });
    }
  }

  return Array.from(catMap.values())
    .map((c) => ({
      categoryName: c.name,
      pillar: c.pillar,
      spent: c.spent,
      percentOfPillar: pillarSpent[c.pillar] > 0 ? (c.spent / pillarSpent[c.pillar]) * 100 : 0,
      trend: 'stable' as const,
      icon: c.icon,
    }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);
}

function computeElasticity(
  pillars: Record<Pillar, PillarState>,
  tolerance: number,
  reasonNtoW: string,
  reasonWtoN: string,
): ElasticityTransfer[] {
  const transfers: ElasticityTransfer[] = [];

  // If wants is over budget and needs has surplus, suggest transfer
  if (pillars.wants.percentUsed > 100 + tolerance && pillars.needs.remaining > 0) {
    const transferAmount = Math.min(pillars.wants.spent - pillars.wants.budgeted, pillars.needs.remaining);
    if (transferAmount > 0) {
      transfers.push({
        from: 'needs',
        to: 'wants',
        amount: transferAmount,
        reason: reasonNtoW,
      });
    }
  }

  if (pillars.needs.percentUsed > 100 + tolerance && pillars.wants.remaining > 0) {
    const transferAmount = Math.min(pillars.needs.spent - pillars.needs.budgeted, pillars.wants.remaining);
    if (transferAmount > 0) {
      transfers.push({
        from: 'wants',
        to: 'needs',
        amount: transferAmount,
        reason: reasonWtoN,
      });
    }
  }

  return transfers;
}

function computeGoalSavings(
  goals: EngineGoal[],
  savingsSpent: number,
  savingsBudget: number
): GoalSavingsAnalysis | null {
  if (goals.length === 0) return null;

  const goal = goals[0]; // Primary goal
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return null;

  const targetDate = new Date(goal.targetDate);
  const now = new Date();
  const monthsRemaining = Math.max(1, (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()));

  const monthlyRequired = remaining / monthsRemaining;
  const currentSavingsRate = savingsSpent;
  const gap = monthlyRequired - currentSavingsRate;

  return {
    monthlyRequired,
    currentSavingsRate,
    onTrack: currentSavingsRate >= monthlyRequired,
    gap,
    goalName: goal.name,
  };
}
