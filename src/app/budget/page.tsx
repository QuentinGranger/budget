'use client';

import React, { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { computeSmartSplit } from '@/lib/budget-engine';
import ProgressBar from '@/components/ui/ProgressBar/ProgressBar';
import { Home, AlertTriangle, TrendingUp, Lightbulb, ArrowRight, Zap, BarChart3 } from 'lucide-react';
import type { Pillar } from '@/lib/types';
import styles from './budget.module.scss';

const PILLAR_KEYS: Record<Pillar, string> = { needs: 'd.needs', wants: 'd.wants', savings: 'd.savings' };
const PILLAR_VARIANT: Record<Pillar, 'needs' | 'wants' | 'savings'> = { needs: 'needs', wants: 'wants', savings: 'savings' };

export default function BudgetPage() {
  const { state, snapshot } = useStore();
  const { locale, t, dateLocale } = useI18n();
  const user = state.user;

  const currency = user?.currency || 'EUR';
  const fmt = useMemo(() => (n: number) => n.toLocaleString(dateLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }), [dateLocale, currency]);

  if (!user || !snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><BarChart3 size={48} /></div>
          <div className={styles.emptyTitle}>{t('b.emptyTitle')}</div>
          <div className={styles.emptyText}>
            {t('b.emptyText')}
          </div>
        </div>
      </div>
    );
  }

  const settings = user.settings;
  const totalIncome = snapshot.totalIncome;
  const velocity = snapshot.intelligence.velocity;

  const split = useMemo(() => {
    if (!settings || totalIncome <= 0) return null;
    return computeSmartSplit({
      totalIncome,
      monthlyFixedExpenses: settings.monthlyFixedExpenses || 0,
      financialGoal: settings.financialGoal || 'control',
      comfortLevel: settings.comfortLevel || 'moderate',
      incomeType: settings.incomeType || 'stable',
      disciplineLevel: settings.disciplineLevel || 'moderate',
    }, locale, fmt);
  }, [settings, totalIncome, locale, fmt]);

  const pillars: Pillar[] = ['needs', 'wants', 'savings'];

  const healthTone = snapshot.statusTone;
  const healthClass =
    healthTone === 'positive' ? styles.healthPositive :
    healthTone === 'caution' ? styles.healthCaution :
    healthTone === 'warning' ? styles.healthWarning : styles.healthNeutral;

  const tauxEffort = totalIncome > 0 ? (snapshot.monthlyFixedExpenses / totalIncome) * 100 : 0;

  const pillarCategories = useMemo(() => {
    const map: Record<Pillar, typeof snapshot.intelligence.categoryInsights> = { needs: [], wants: [], savings: [] };
    for (const ci of snapshot.intelligence.categoryInsights) {
      if (map[ci.pillar]) map[ci.pillar].push(ci);
    }
    return map;
  }, [snapshot.intelligence.categoryInsights]);

  const mergedSignals = useMemo(() => {
    const signals: { id: string; message: string; type: 'warning' | 'danger' | 'info' | 'tip' }[] = [];
    for (const a of snapshot.alerts) {
      signals.push({ id: a.id, message: a.message, type: a.type });
    }
    for (const r of snapshot.recommendations) {
      signals.push({ id: r.id, message: r.message, type: r.type === 'action' ? 'warning' : 'tip' });
    }
    return signals;
  }, [snapshot.alerts, snapshot.recommendations]);

  return (
    <div className={styles.page}>
      {/* ── Header + Health Badge ── */}
      <div className={styles.header}>
        <h1>{t('b.title')}</h1>
        <div className={`${styles.healthBadge} ${healthClass}`}>
          {snapshot.healthScore}/100 — {snapshot.healthLabel}
        </div>
      </div>

      {/* ── Month Summary ── */}
      <div className={styles.summaryStrip}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryValue}>{fmt(totalIncome)}</div>
          <div className={styles.summaryLabel}>{t('b.monthIncome')}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryValue}>{fmt(snapshot.totalSpent)}</div>
          <div className={styles.summaryLabel}>{t('b.spent')}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={`${styles.summaryValue} ${snapshot.totalRemaining >= 0 ? styles.valPositive : styles.valNegative}`}>
            {fmt(snapshot.totalRemaining)}
          </div>
          <div className={styles.summaryLabel}>{t('b.remaining')}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={`${styles.summaryValue} ${velocity?.onTrack ? styles.valOnTrack : styles.valOffTrack}`}>
            {velocity ? fmt(velocity.projectedMonthTotal) : '-'}
          </div>
          <div className={styles.summaryLabel}>{t('b.projEndMonth')}</div>
        </div>
      </div>

      {/* ── Situation Strip (Charges fixes) ── */}
      {snapshot.monthlyFixedExpenses > 0 && (
        <div className={styles.situationStrip}>
          <div className={styles.sitItem}>
            <Home size={13} className={styles.sitIcon} />
            <span className={styles.sitLabel}>{t('b.rent')}</span>
            <span className={styles.sitValue}>{fmt(snapshot.monthlyFixedExpenses)}</span>
          </div>
          <div className={styles.sitDivider} />
          <div className={styles.sitItem}>
            <span className={styles.sitLabel}>{t('b.livingMoney')}</span>
            <span className={`${styles.sitValue} ${snapshot.resteAVivre > 0 ? styles.valPositive : styles.valNegative}`}>
              {fmt(snapshot.resteAVivre)}
            </span>
          </div>
          <div className={styles.sitDivider} />
          <div className={styles.sitItem}>
            <span className={styles.sitLabel}>{t('b.effortRate')}</span>
            <span className={`${styles.sitValue} ${tauxEffort > 33 ? styles.sitWarn : ''}`}>
              {Math.round(tauxEffort)}%
            </span>
            {tauxEffort > 33 && <AlertTriangle size={12} className={styles.sitWarn} />}
          </div>
          <div className={styles.sitDivider} />
          <div className={styles.sitItem}>
            <span className={styles.sitLabel}>{t('b.daysLeft')}</span>
            <span className={styles.sitValue}>{snapshot.daysLeft}</span>
          </div>
        </div>
      )}

      {/* ── Pillar Cards ── */}
      <div className={styles.pillarGrid}>
        {pillars.map((p) => {
          const ps = snapshot.pillars[p];
          const cats = pillarCategories[p];
          const pv = velocity?.pillarVelocity[p];
          const statusClass = ps.percentUsed > 100 ? styles.statusOver : ps.percentUsed > 85 ? styles.statusCaution : styles.statusOk;
          const statusLabel = ps.percentUsed > 100 ? t('b.statusOver') : ps.percentUsed > 85 ? t('b.statusCaution') : t('b.statusOk');

          return (
            <div key={p} className={`${styles.pillarCard} ${styles[p + 'Pillar']}`}>
              <div className={styles.pillarTop}>
                <span className={`${styles.pillarLabel} ${styles[p + 'Color']}`}>{t(PILLAR_KEYS[p])}</span>
                <span className={styles.pillarTarget}>{ps.targetPercent}% — {fmt(ps.budgeted)}</span>
              </div>

              <div className={styles.pillarAmounts}>
                <span className={styles.pillarSpent}>{fmt(ps.spent)}</span>
                <span className={styles.pillarBudgeted}>/ {fmt(ps.budgeted)}</span>
              </div>

              <div className={styles.pillarBar}>
                <ProgressBar percent={ps.percentUsed} variant={PILLAR_VARIANT[p]} />
              </div>

              <div className={styles.pillarFooter}>
                <span className={`${styles.pillarRemaining} ${ps.remaining >= 0 ? styles.valPositive : styles.valNegative}`}>
                  {ps.remaining >= 0 ? t('b.xRemaining', { amount: fmt(ps.remaining) }) : t('b.xOver', { amount: fmt(Math.abs(ps.remaining)) })}
                </span>
                <span className={`${styles.pillarStatus} ${statusClass}`}>{statusLabel}</span>
              </div>

              {cats.length > 0 && (
                <div className={styles.pillarCats}>
                  {cats.slice(0, 3).map(ci => (
                    <div key={ci.categoryName} className={styles.pillarCatRow}>
                      <span className={styles.pillarCatIcon}>{ci.icon}</span>
                      <span className={styles.pillarCatName}>{ci.categoryName}</span>
                      <span className={styles.pillarCatAmount}>{fmt(ci.spent)}</span>
                      <span className={styles.pillarCatPercent}>{Math.round(ci.percentOfPillar)}%</span>
                    </div>
                  ))}
                </div>
              )}

              {pv && (
                <div className={styles.pillarProjection}>
                  <span>{t('b.projection')}</span>
                  <span className={`${styles.projValue} ${pv.projected > pv.budget ? styles.valNegative : styles.valPositive}`}>
                    {fmt(pv.projected)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── All Categories Breakdown ── */}
      {snapshot.intelligence.categoryInsights.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('b.catBreakdown')}</h2>
          <div className={styles.categoryList}>
            {snapshot.intelligence.categoryInsights.map((ci) => (
              <div key={ci.categoryName} className={styles.categoryRow}>
                <span className={styles.catIcon}>{ci.icon}</span>
                <div className={styles.catMain}>
                  <div className={styles.catName}>{ci.categoryName}</div>
                  <div className={styles.catPillar}>{t(PILLAR_KEYS[ci.pillar])}</div>
                </div>
                <div className={styles.catBarWrap}>
                  <ProgressBar percent={ci.percentOfPillar} variant={PILLAR_VARIANT[ci.pillar]} />
                </div>
                <span className={styles.catAmount}>{fmt(ci.spent)}</span>
                <span className={`${styles.catPercent} ${ci.percentOfPillar > 50 ? styles.catOver : ''}`}>
                  {Math.round(ci.percentOfPillar)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alerts + Recommendations ── */}
      {mergedSignals.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('b.signals')}</h2>
          <div className={styles.alertsGrid}>
            {mergedSignals.map(sig => {
              const cls =
                sig.type === 'danger' ? styles.alertDanger :
                sig.type === 'warning' ? styles.alertWarning :
                sig.type === 'tip' ? styles.alertTip : styles.alertInfo;
              return (
                <div key={sig.id} className={`${styles.alertItem} ${cls}`}>
                  <span className={styles.alertIcon}>
                    {sig.type === 'danger' ? <AlertTriangle size={14} /> :
                     sig.type === 'warning' ? <AlertTriangle size={14} /> :
                     sig.type === 'tip' ? <Lightbulb size={14} /> : <Zap size={14} />}
                  </span>
                  <span>{sig.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Elasticity Transfers ── */}
      {snapshot.intelligence.elasticity.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('b.rebalancing')}</h2>
          <div className={styles.elasticityCard}>
            {snapshot.intelligence.elasticity.map((tr, i) => (
              <div key={i} className={styles.transferRow}>
                <span className={styles.transferFrom}>{t(PILLAR_KEYS[tr.from])}</span>
                <ArrowRight size={14} className={styles.transferArrow} />
                <span className={styles.transferTo}>{t(PILLAR_KEYS[tr.to])}</span>
                <span className={styles.transferAmount}>{fmt(tr.amount)}</span>
                <span className={styles.transferReason}>{tr.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Smart Split Analysis ── */}
      {split && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('b.analysis')}</h2>
          <div className={styles.analysisCard}>
            <div className={styles.profileBadges}>
              <span className={`${styles.profileBadge} ${split.incomeProfile === 'low' ? styles.badgeLow : split.incomeProfile === 'medium' ? styles.badgeMedium : styles.badgeHigh}`}>
                {split.incomeProfile === 'low' ? t('b.incomeLow') : split.incomeProfile === 'medium' ? t('b.incomeMedium') : t('b.incomeHigh')}
              </span>
              <span className={`${styles.profileBadge} ${split.pressureLevel === 'critical' ? styles.badgeCritical : split.pressureLevel === 'high' ? styles.badgeLow : split.pressureLevel === 'moderate' ? styles.badgeMedium : styles.badgeHigh}`}>
                {split.pressureLevel === 'critical' ? t('b.pressureCritical') : split.pressureLevel === 'high' ? t('b.pressureHigh') : split.pressureLevel === 'moderate' ? t('b.pressureModerate') : t('b.pressureLow')}
              </span>
            </div>

            {split.resteAVivre > 0 && (
              <div className={styles.splitRow}>
                <span className={styles.splitLabel}>{t('b.ravAfterRent')}</span>
                <span className={`${styles.splitValue} ${styles.splitGold}`}>{fmt(split.resteAVivre)}</span>
              </div>
            )}

            <div className={styles.splitRow}>
              <span className={styles.splitLabel}>{t('b.recommendedSplit')}</span>
              <span className={styles.splitValue}>
                <span className={styles.splitNeeds}>{split.needs}</span>/<span className={styles.splitWants}>{split.wants}</span>/<span className={styles.splitSavings}>{split.savings}</span>
              </span>
            </div>

            {split.reasoning.length > 0 && (
              <div className={styles.reasoning}>
                {split.reasoning.map((r, i) => (
                  <div key={i} className={`${styles.reasonItem} ${r.startsWith('\u26A0') ? styles.warning : ''}`}>{r}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
