'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { computeBudgetSnapshot, type EngineTransaction, type EngineGoal, type EngineSettings } from '@/lib/budget-engine';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import ProgressBar from '@/components/ui/ProgressBar/ProgressBar';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, CreditCard, Target, Plus, ArrowRight, Lightbulb, Zap, Calendar, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import type { Pillar } from '@/lib/types';
import styles from './dashboard.module.scss';

const PILLAR_KEYS: Record<Pillar, string> = { needs: 'd.needs', wants: 'd.wants', savings: 'd.savings' };
const PILLAR_COLORS: Record<Pillar, string> = { needs: '#4a90e2', wants: '#b06ce6', savings: '#2ecc71' };
const PILLAR_VARIANT: Record<Pillar, 'needs' | 'wants' | 'savings'> = { needs: 'needs', wants: 'wants', savings: 'savings' };

function getGreetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return 'd.morning';
  if (h < 18) return 'd.afternoon';
  return 'd.evening';
}

function getMonthDate(offset: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d;
}

export default function DashboardPage() {
  const { state, snapshot: currentSnapshot, allTransactions } = useStore();
  const { locale, t, dateLocale } = useI18n();
  const user = state.user;
  const [monthOffset, setMonthOffset] = useState(0);

  const isCurrentMonth = monthOffset === 0;
  const selectedDate = useMemo(() => getMonthDate(monthOffset), [monthOffset]);
  const monthLabel = useMemo(() => selectedDate.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' }), [selectedDate, dateLocale]);

  const currency = user?.currency || 'EUR';
  const fmt = useMemo(() => (n: number) => n.toLocaleString(dateLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }), [dateLocale, currency]);

  // Compute snapshot for the selected month (always with current locale)
  const snapshot = useMemo(() => {
    if (!user || !user.settings) return null;

    const s = user.settings;
    const totalIncome = user.incomes.filter((i: { isActive: boolean }) => i.isActive).reduce((sum: number, i: { amount: number }) => sum + i.amount, 0);
    const engineSettings: EngineSettings = {
      needsPercent: s.needsPercent,
      wantsPercent: s.wantsPercent,
      savingsPercent: s.savingsPercent,
      tolerancePercent: s.tolerancePercent,
      monthlyFixedExpenses: s.monthlyFixedExpenses,
      financialGoal: s.financialGoal,
      comfortLevel: s.comfortLevel,
      incomeType: s.incomeType,
      disciplineLevel: s.disciplineLevel,
    };
    const engineTxns: EngineTransaction[] = allTransactions.map((tx) => ({
      amount: tx.amount, date: tx.date, pillar: tx.pillar, categoryId: tx.categoryId,
      category: tx.category ? { name: tx.category.name, icon: tx.category.icon, pillar: tx.category.pillar } : undefined,
    }));
    const engineGoals: EngineGoal[] = user.goals.map((g: { name: string; targetAmount: number; currentAmount: number; targetDate: string }) => ({
      name: g.name, targetAmount: g.targetAmount, currentAmount: g.currentAmount, targetDate: g.targetDate,
    }));
    return computeBudgetSnapshot(totalIncome, engineSettings, engineTxns, engineGoals, isCurrentMonth ? undefined : selectedDate, locale, fmt);
  }, [user, allTransactions, isCurrentMonth, selectedDate, locale, fmt]);

  if (!user) return <div className={styles.empty}>{t('d.loading')}</div>;
  if (!snapshot) return <div className={styles.empty}>{t('d.configure')}</div>;

  // Filter transactions for selected month
  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth();
  const monthTx = allTransactions.filter((tx) => {
    const d = new Date(tx.date);
    return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
  });
  const recentTx = monthTx.slice(0, 6);

  const toneClass = snapshot.statusTone === 'positive' ? 'Positive' : snapshot.statusTone === 'caution' ? 'Caution' : snapshot.statusTone === 'warning' ? 'Warning' : 'Neutral';
  const goals = user.goals || [];
  const velocity = snapshot.intelligence.velocity;

  // Donut chart data
  const donutData = (['needs', 'wants', 'savings'] as Pillar[]).map((p) => ({
    name: t(PILLAR_KEYS[p]),
    value: Math.max(snapshot.pillars[p].spent, 0),
    color: PILLAR_COLORS[p],
  }));
  const hasSpending = donutData.some((d) => d.value > 0);

  return (
    <div className={styles.page}>

      {/* ── Greeting ── */}
      <div className={styles.greeting}>
        <div className={styles.greetingLeft}>
          <h1>{t(getGreetingKey())}, {user.name?.split(' ')[0] || t('d.you')}</h1>
          <div className={styles.greetingSubtext}>{snapshot.statusMessage}</div>
        </div>
        <div className={styles.monthSelector}>
          <button className={styles.monthArrow} onClick={() => setMonthOffset(monthOffset - 1)} aria-label={t('d.prevMonth')}>
            <ChevronLeft size={18} />
          </button>
          <button className={`${styles.monthLabel} ${isCurrentMonth ? styles.monthCurrent : ''}`} onClick={() => setMonthOffset(0)}>
            {monthLabel}
          </button>
          <button className={styles.monthArrow} onClick={() => setMonthOffset(monthOffset + 1)} disabled={monthOffset >= 0} aria-label={t('d.nextMonth')}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Hero Status Card ── */}
      <div className={`${styles.heroCard} ${styles['hero' + toneClass]}`}>
        <div className={styles.heroScore}>
          <div className={`${styles.scoreCircle} ${styles['score' + toneClass]}`}>
            {snapshot.healthScore}
          </div>
          <div className={styles.scoreLabel}>{snapshot.healthLabel}</div>
        </div>
        <div className={styles.heroContent}>
          <div className={styles.heroTitle}>{t('d.healthTitle')}</div>
          <div className={styles.heroMessage}>{snapshot.statusMessage}</div>
          <div className={styles.heroMeta}>
            <div className={styles.heroMetaItem}>
              <Calendar size={12} />
              {t('d.day')} <span>{snapshot.daysElapsed}</span>/{snapshot.daysInMonth}
            </div>
            <div className={styles.heroMetaItem}>
              {t('d.daysLeft', { n: snapshot.daysLeft })}
            </div>
            {velocity && (
              <div className={styles.heroMetaItem}>
                ~<span>{fmt(velocity.dailyAverage)}</span>{t('d.perDay')}
              </div>
            )}
          </div>
          <div className={styles.monthProgress}>
            <div className={styles.monthProgressFill} style={{ width: `${Math.round(snapshot.monthProgress * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* ── Loyer Strip ── */}
      {snapshot.monthlyFixedExpenses > 0 && (
        <div className={styles.loyerStrip}>
          <div className={styles.loyerItem}>
            <Home size={14} className={styles.loyerIcon} />
            <span className={styles.loyerLabel}>{t('d.rent')}</span>
            <span className={styles.loyerValue}>{fmt(snapshot.monthlyFixedExpenses)}</span>
          </div>
          <div className={styles.loyerDivider} />
          <div className={styles.loyerItem}>
            <span className={styles.loyerLabel}>{t('d.livingMoney')}</span>
            <span className={`${styles.loyerValue} ${snapshot.resteAVivre > 0 ? styles.loyerPositive : styles.loyerNegative}`}>{fmt(snapshot.resteAVivre)}</span>
          </div>
          <div className={styles.loyerDivider} />
          <div className={styles.loyerItem}>
            <span className={styles.loyerLabel}>{t('d.effortRate')}</span>
            <span className={`${styles.loyerValue} ${(snapshot.monthlyFixedExpenses / Math.max(snapshot.totalIncome, 1)) * 100 > 33 ? styles.loyerNegative : styles.loyerPositive}`}>
              {Math.round((snapshot.monthlyFixedExpenses / Math.max(snapshot.totalIncome, 1)) * 100)}%
            </span>
            <span className={styles.loyerNorm}>{t('d.norm33')}</span>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiIncome}`}>
          <div className={styles.kpiIcon}><Wallet size={16} /></div>
          <div className={styles.kpiValue}>{fmt(snapshot.totalIncome)}</div>
          <div className={styles.kpiLabel}>{t('d.income')}</div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiSpent}`}>
          <div className={styles.kpiIcon}><CreditCard size={16} /></div>
          <div className={styles.kpiValue}>{fmt(snapshot.totalSpent)}</div>
          <div className={styles.kpiLabel}>{t('d.spent')}</div>
          <div className={styles.kpiSub}>{t('d.ofIncome', { pct: Math.round((snapshot.totalSpent / Math.max(snapshot.totalIncome, 1)) * 100) })}</div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiRemaining}`}>
          <div className={styles.kpiIcon}>{snapshot.totalRemaining >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}</div>
          <div className={styles.kpiValue}>{fmt(snapshot.totalRemaining)}</div>
          <div className={styles.kpiLabel}>{t('d.remaining')}</div>
          {snapshot.daysLeft > 0 && snapshot.totalRemaining > 0 && (
            <div className={styles.kpiSub}>~{fmt(snapshot.totalRemaining / snapshot.daysLeft)}{t('d.perDay')}</div>
          )}
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiSavings}`}>
          <div className={styles.kpiIcon}><PiggyBank size={16} /></div>
          <div className={styles.kpiValue}>{fmt(snapshot.pillars.savings.spent)}</div>
          <div className={styles.kpiLabel}>{t('d.savingsMonth')}</div>
          <div className={styles.kpiSub}>{t('d.on', { amount: fmt(snapshot.pillars.savings.budgeted) })}</div>
        </div>
      </div>

      {/* ── Main Two-Column Layout ── */}
      <div className={styles.mainGrid}>

        {/* ── Left Column ── */}
        <div className={styles.mainLeft}>

          {/* Pillar Cards */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('d.split')}</h2>
              <Link href="/budget" className={styles.sectionLink}>{t('d.details')} <ArrowRight size={11} /></Link>
            </div>
            <div className={styles.pillarGrid}>
              {(['needs', 'wants', 'savings'] as Pillar[]).map((p) => {
                const ps = snapshot.pillars[p];
                const remaining = ps.remaining;
                return (
                  <div key={p} className={`${styles.pillarCard} ${styles[p + 'Pillar']}`}>
                    <div className={styles.pillarHeader}>
                      <span className={`${styles.pillarLabel} ${styles[p + 'Color']}`}>{t(PILLAR_KEYS[p])}</span>
                      <span className={styles.pillarPercent}>{Math.round(ps.percentUsed)}%</span>
                    </div>
                    <div className={styles.pillarSpent}>{fmt(ps.spent)}</div>
                    <div className={styles.pillarBudget}>{t('d.on', { amount: fmt(ps.budgeted) })}</div>
                    <ProgressBar percent={ps.percentUsed} variant={PILLAR_VARIANT[p]} />
                    <div className={`${styles.pillarRemaining} ${remaining >= 0 ? styles.remainPositive : styles.remainNegative}`}>
                      {remaining >= 0 ? t('d.xRemaining', { amount: fmt(remaining) }) : t('d.xOver', { amount: fmt(Math.abs(remaining)) })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Donut Chart + Legend */}
          {hasSpending && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{t('d.realSplit')}</h2>
              </div>
              <div className={styles.chartCard}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.chartLegend}>
                  {(['needs', 'wants', 'savings'] as Pillar[]).map((p) => {
                    const ps = snapshot.pillars[p];
                    const actualPercent = snapshot.totalSpent > 0 ? Math.round((ps.spent / snapshot.totalSpent) * 100) : 0;
                    return (
                      <div key={p} className={styles.legendItem}>
                        <div className={styles.legendDot} style={{ backgroundColor: PILLAR_COLORS[p] }} />
                        <span className={styles.legendLabel}>{t(PILLAR_KEYS[p])}</span>
                        <span className={styles.legendValue}>{actualPercent}%</span>
                        <span style={{ fontSize: 12, color: '#5c5a6e', marginLeft: 4 }}>({ps.targetPercent}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('d.recentTx')}</h2>
              <Link href="/transactions" className={styles.sectionLink}>{t('d.viewAll')} <ArrowRight size={11} /></Link>
            </div>
            {recentTx.length === 0 ? (
              <div className={styles.emptySmall}>{t('d.noTx')}</div>
            ) : (
              <div className={styles.txList}>
                {recentTx.map((tx) => (
                  <div key={tx.id} className={styles.txRow}>
                    <div className={`${styles.txIcon} ${styles['txIcon' + (tx.pillar === 'needs' ? 'Needs' : tx.pillar === 'wants' ? 'Wants' : 'Savings')]}`}>
                      <CreditCard size={16} />
                    </div>
                    <div className={styles.txInfo}>
                      <div className={styles.txDesc}>{tx.description || tx.category?.name || t('d.transaction')}</div>
                      <div className={styles.txCategory}>{tx.category?.name || ''}</div>
                    </div>
                    <div className={styles.txRight}>
                      <div className={styles.txAmount}>{fmt(tx.amount)}</div>
                      <div className={styles.txDate}>{new Date(tx.date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column ── */}
        <div className={styles.mainRight}>

          {/* Quick Actions */}
          <div className={styles.section}>
            <div className={styles.quickActions}>
              <Link href="/transactions" className={`${styles.quickBtn} ${styles.quickBtnPrimary}`}>
                <Plus size={14} /> {t('d.expense')}
              </Link>
              <Link href="/goals" className={styles.quickBtn}>
                <Target size={14} /> {t('d.goal')}
              </Link>
              <Link href="/settings" className={styles.quickBtn}>
                <Zap size={14} /> {t('d.budget')}
              </Link>
            </div>
          </div>

          {/* Alerts */}
          {snapshot.alerts.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{t('d.alerts')}</h2>
              </div>
              <div className={styles.alertsList}>
                {snapshot.alerts.map((a) => (
                  <div key={a.id} className={`${styles.alertItem} ${a.type === 'danger' ? styles.alertDanger : a.type === 'warning' ? styles.alertWarning : styles.alertInfo}`}>
                    {a.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projection */}
          {velocity && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{t('d.projection')}</h2>
              </div>
              <div className={styles.projectionCard}>
                <div className={styles.projRow}>
                  <span className={styles.projLabel}>{t('d.projSpent')}</span>
                  <span className={`${styles.projValue} ${velocity.onTrack ? styles.projGood : styles.projBad}`}>
                    {fmt(velocity.projectedMonthTotal)}
                  </span>
                </div>
                <div className={styles.projRow}>
                  <span className={styles.projLabel}>{t('d.projBudget')}</span>
                  <span className={styles.projValue}>{fmt(velocity.budgetTotal)}</span>
                </div>
                <div className={styles.projRow}>
                  <span className={styles.projLabel}>{t('d.projGap')}</span>
                  <span className={`${styles.projValue} ${velocity.onTrack ? styles.projGood : styles.projBad}`}>
                    {velocity.onTrack ? '+' : ''}{fmt(velocity.budgetTotal - velocity.projectedMonthTotal)}
                  </span>
                </div>
                <div className={styles.projRow}>
                  <span className={styles.projLabel}>{t('d.projDaily')}</span>
                  <span className={styles.projValue}>{fmt(velocity.dailyAverage)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {snapshot.recommendations.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{t('d.tips')}</h2>
              </div>
              <div className={styles.recoList}>
                {snapshot.recommendations.slice(0, 4).map((r) => (
                  <div key={r.id} className={`${styles.recoItem} ${r.type === 'action' ? styles.recoAction : ''}`}>
                    <div className={styles.recoIcon}>
                      {r.type === 'action' ? <Zap size={14} /> : <Lightbulb size={14} />}
                    </div>
                    <span>{r.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Goals */}
          {goals.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{t('d.goals')}</h2>
                <Link href="/goals" className={styles.sectionLink}>{t('d.view')} <ArrowRight size={11} /></Link>
              </div>
              <div className={styles.goalsList}>
                {goals.slice(0, 3).map((g) => {
                  const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
                  return (
                    <div key={g.id} className={styles.goalCard}>
                      <div className={styles.goalHeader}>
                        <span className={styles.goalName}>{g.name}</span>
                        <span className={styles.goalPercent}>{pct}%</span>
                      </div>
                      <ProgressBar percent={pct} variant="savings" />
                      <div className={styles.goalAmounts}>
                        {fmt(g.currentAmount)} {t('d.on', { amount: fmt(g.targetAmount) })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
