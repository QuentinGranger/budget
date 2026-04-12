'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Zap, BarChart3 } from 'lucide-react';
import ProgressBar from '@/components/ui/ProgressBar/ProgressBar';
import { useI18n } from '@/lib/i18n';
import { iconToEmoji } from '@/lib/icon-map';
import type { Pillar } from '@/lib/types';
import styles from './analytics.module.scss';

const PC: Record<Pillar, string> = { needs: '#4a90e2', wants: '#b06ce6', savings: '#2ecc71' };
const PILLAR_KEYS: Record<Pillar, string> = { needs: 'd.needs', wants: 'd.wants', savings: 'd.savings' };
const PERIODS = [3, 6, 12] as const;
type Period = typeof PERIODS[number];

interface MonthBucket {
  key: string;
  label: string;
  income: number;
  spent: number;
  saved: number;
  needs: number;
  wants: number;
  savings: number;
  txCount: number;
  categories: Map<string, { name: string; icon: string; pillar: Pillar; spent: number }>;
}

function CustomTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: p.color }} />
          <span className={styles.tooltipName}>{p.name}</span>
          <span className={styles.tooltipValue}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { state, snapshot, allTransactions } = useStore();
  const { t, dateLocale } = useI18n();
  const user = state.user;
  const [period, setPeriod] = useState<Period>(6);

  const currency = user?.currency || 'EUR';
  const fmt = (n: number) => n.toLocaleString(dateLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}%`;

  const totalIncome = snapshot?.totalIncome ?? 0;
  const settings = user?.settings ?? null;

  // ── Monthly aggregation ──
  const months = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - period, 1);
    const buckets = new Map<string, MonthBucket>();

    for (let m = 0; m < period; m++) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(dateLocale, { month: 'short', year: '2-digit' });
      buckets.set(key, { key, label, income: totalIncome, spent: 0, saved: 0, needs: 0, wants: 0, savings: 0, txCount: 0, categories: new Map() });
    }

    for (const tx of allTransactions) {
      const d = new Date(tx.date);
      if (d < cutoff) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const b = buckets.get(key);
      if (!b) continue;
      b.spent += tx.amount;
      b.txCount++;
      const p = tx.pillar as Pillar;
      if (p === 'needs') b.needs += tx.amount;
      else if (p === 'wants') b.wants += tx.amount;
      else if (p === 'savings') b.savings += tx.amount;

      const catName = tx.category?.name || t('a.other');
      const catIcon = tx.category?.icon || '';
      const catPillar = (tx.category?.pillar || tx.pillar) as Pillar;
      const existing = b.categories.get(catName);
      if (existing) existing.spent += tx.amount;
      else b.categories.set(catName, { name: catName, icon: catIcon, pillar: catPillar, spent: tx.amount });
    }

    for (const b of buckets.values()) {
      b.saved = b.income - b.spent;
    }

    return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [allTransactions, totalIncome, period]);

  const hasData = months.some(m => m.txCount > 0);

  // ── Summary KPIs ──
  const summary = useMemo(() => {
    const activeMonths = months.filter(m => m.txCount > 0);
    const count = activeMonths.length || 1;
    const avgSpent = activeMonths.reduce((s, m) => s + m.spent, 0) / count;
    const avgSaved = activeMonths.reduce((s, m) => s + m.saved, 0) / count;
    const savingsRate = totalIncome > 0 ? (avgSaved / totalIncome) * 100 : 0;

    const curr = months[months.length - 1];
    const prev = months.length > 1 ? months[months.length - 2] : null;
    const spentDelta = prev && prev.spent > 0 ? ((curr.spent - prev.spent) / prev.spent) * 100 : 0;

    return { avgSpent, avgSaved, savingsRate, spentDelta, txCount: activeMonths.reduce((s, m) => s + m.txCount, 0) };
  }, [months, totalIncome]);

  // ── Pillar trends ──
  const pillarTrends = useMemo(() => {
    const pillars: Pillar[] = ['needs', 'wants', 'savings'];
    const activeMonths = months.filter(m => m.txCount > 0);
    const count = activeMonths.length || 1;

    return pillars.map(p => {
      const avg = activeMonths.reduce((s, m) => s + m[p], 0) / count;
      const curr = months[months.length - 1]?.[p] || 0;
      const prev = months.length > 1 ? months[months.length - 2]?.[p] || 0 : 0;
      const delta = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
      const targetPct = settings ? (p === 'needs' ? settings.needsPercent : p === 'wants' ? settings.wantsPercent : settings.savingsPercent) : (p === 'needs' ? 50 : p === 'wants' ? 30 : 20);
      const targetAmount = totalIncome * (targetPct / 100);

      return { pillar: p, avg, curr, delta, targetPct, targetAmount };
    });
  }, [months, settings, totalIncome]);

  // ── Stacked evolution data ──
  const evolutionData = useMemo(() => {
    return months.map(m => ({
      name: m.label,
      needs: Math.round(m.needs),
      wants: Math.round(m.wants),
      savings: Math.round(m.savings),
    }));
  }, [months]);

  // ── Category ranking (period-wide) ──
  const categoryRanking = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; pillar: Pillar; spent: number; prevSpent: number }>();
    const curr = months[months.length - 1];
    const prev = months.length > 1 ? months[months.length - 2] : null;

    for (const m of months) {
      for (const [name, c] of m.categories) {
        const ex = map.get(name);
        if (ex) ex.spent += c.spent;
        else map.set(name, { ...c, spent: c.spent, prevSpent: 0 });
      }
    }

    if (prev) {
      for (const [name, c] of prev.categories) {
        const ex = map.get(name);
        if (ex) ex.prevSpent = c.spent;
      }
    }
    if (curr) {
      const ranked = Array.from(map.values()).sort((a, b) => b.spent - a.spent);
      for (const r of ranked) {
        const currCat = curr.categories.get(r.name);
        const currSpent = currCat?.spent || 0;
        r.spent = currSpent;
      }
      return ranked.filter(r => r.spent > 0).slice(0, 10);
    }
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent).slice(0, 10);
  }, [months]);

  // ── Daily spending (current month) ──
  const dailyData = useMemo(() => {
    const now = new Date();
    const map = new Map<string, number>();
    for (const tx of allTransactions) {
      const d = new Date(tx.date);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      const day = d.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' });
      map.set(day, (map.get(day) || 0) + tx.amount);
    }
    return Array.from(map.entries()).map(([day, amount]) => ({ day, amount: Math.round(amount) })).sort((a, b) => a.day.localeCompare(b.day));
  }, [allTransactions]);

  // ── Pie data (current month) ──
  const pieData = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.envelopes.filter(e => e.spent > 0).map(e => ({
      name: t(PILLAR_KEYS[e.pillar]),
      value: Math.round(e.spent),
      color: PC[e.pillar],
    }));
  }, [snapshot]);

  // ── Smart insights ──
  const healthScore = snapshot?.healthScore ?? 0;
  const insights = useMemo(() => {
    const msgs: { id: string; message: string; tone: 'positive' | 'caution' | 'info' }[] = [];
    if (!hasData) return msgs;

    if (summary.savingsRate >= 20) {
      msgs.push({ id: 'sav-good', message: t('a.insightSavGood', { pct: Math.round(summary.savingsRate) }), tone: 'positive' });
    } else if (summary.savingsRate >= 10) {
      msgs.push({ id: 'sav-ok', message: t('a.insightSavOk', { pct: Math.round(summary.savingsRate) }), tone: 'info' });
    } else if (summary.savingsRate >= 0) {
      msgs.push({ id: 'sav-low', message: t('a.insightSavLow', { pct: Math.round(summary.savingsRate) }), tone: 'caution' });
    }

    if (summary.spentDelta > 15) {
      msgs.push({ id: 'spend-up', message: t('a.insightSpendUp', { pct: Math.round(summary.spentDelta) }), tone: 'caution' });
    } else if (summary.spentDelta < -10) {
      msgs.push({ id: 'spend-down', message: t('a.insightSpendDown', { pct: Math.round(Math.abs(summary.spentDelta)) }), tone: 'positive' });
    }

    const needsTrend = pillarTrends.find(p => p.pillar === 'needs');
    if (needsTrend && needsTrend.curr > needsTrend.targetAmount * 1.1) {
      msgs.push({ id: 'needs-over', message: t('a.insightNeedsOver', { amount: fmt(Math.round(needsTrend.curr - needsTrend.targetAmount)) }), tone: 'caution' });
    }

    const wantsTrend = pillarTrends.find(p => p.pillar === 'wants');
    if (wantsTrend && wantsTrend.delta > 20) {
      msgs.push({ id: 'wants-accel', message: t('a.insightWantsAccel', { pct: Math.round(wantsTrend.delta) }), tone: 'caution' });
    }

    if (healthScore >= 80) {
      msgs.push({ id: 'health', message: t('a.insightHealthGood', { score: healthScore }), tone: 'positive' });
    }

    return msgs;
  }, [hasData, summary, pillarTrends, healthScore, fmt]);

  // ── Early return AFTER all hooks ──
  if (!user || !snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><BarChart3 size={48} /></div>
          <div className={styles.emptyTitle}>{t('a.title')}</div>
          <div className={styles.emptyText}>{t('a.emptyText')}</div>
        </div>
      </div>
    );
  }

  const TICK = { fill: '#5c5a6e', fontSize: 11 };
  const GRID = '#1a1a2a';

  return (
    <div className={styles.page}>
      {/* ── Header + Period ── */}
      <div className={styles.header}>
        <h1>{t('a.title')}</h1>
        <div className={styles.periodSelector}>
          {PERIODS.map(p => (
            <button
              key={p}
              className={`${styles.periodBtn} ${period === p ? styles.periodActive : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}M
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><BarChart3 size={48} /></div>
          <div className={styles.emptyTitle}>{t('a.noDataTitle')}</div>
          <div className={styles.emptyText}>{t('a.noDataText')}</div>
        </div>
      ) : (
        <>
          {/* ── Summary Strip ── */}
          <div className={styles.summaryStrip}>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{fmt(summary.avgSpent)}</div>
              <div className={styles.summaryLabel}>{t('a.avgSpent')}</div>
              {summary.spentDelta !== 0 && (
                <div className={`${styles.summaryDelta} ${summary.spentDelta > 0 ? styles.valNegative : styles.valPositive}`}>
                  {pct(summary.spentDelta)} {t('a.vsPrev')}
                </div>
              )}
            </div>
            <div className={styles.summaryItem}>
              <div className={`${styles.summaryValue} ${summary.savingsRate >= 20 ? styles.valPositive : summary.savingsRate >= 0 ? styles.valCaution : styles.valNegative}`}>
                {Math.round(summary.savingsRate)}%
              </div>
              <div className={styles.summaryLabel}>{t('a.savingsRate')}</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={`${styles.summaryValue} ${snapshot.healthScore >= 70 ? styles.valPositive : snapshot.healthScore >= 40 ? styles.valCaution : styles.valNegative}`}>
                {snapshot.healthScore}/100
              </div>
              <div className={styles.summaryLabel}>{t('a.healthScore')}</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{summary.txCount}</div>
              <div className={styles.summaryLabel}>{t('a.txCount', { n: period })}</div>
            </div>
          </div>

          {/* ── Pillar Trend Cards ── */}
          <div className={styles.pillarTrends}>
            {pillarTrends.map(pt => {
              const colorClass = pt.pillar === 'needs' ? styles.ptNeedsColor : pt.pillar === 'wants' ? styles.ptWantsColor : styles.ptSavingsColor;
              const trendClass = pt.pillar === 'needs' ? styles.pillarTrendNeeds : pt.pillar === 'wants' ? styles.pillarTrendWants : styles.pillarTrendSavings;
              const deltaGood = pt.pillar === 'savings' ? pt.delta > 0 : pt.delta < 0;

              return (
                <div key={pt.pillar} className={`${styles.pillarTrend} ${trendClass}`}>
                  <div className={styles.ptHeader}>
                    <span className={`${styles.ptLabel} ${colorClass}`}>{t(PILLAR_KEYS[pt.pillar])}</span>
                    <span className={styles.ptTarget}>{t('a.target', { pct: pt.targetPct })}</span>
                  </div>
                  <div className={styles.ptAvg}>{fmt(pt.avg)}</div>
                  <div className={styles.ptSub}>{t('a.avgMonth')}</div>
                  {pt.delta !== 0 && (
                    <div className={`${styles.ptDelta} ${deltaGood ? styles.valPositive : styles.valNegative}`}>
                      {deltaGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {pct(pt.delta)} {t('a.vsPrev')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Charts ── */}
          <div className={styles.chartsGrid}>
            {/* Monthly evolution (stacked area) */}
            <div className={`${styles.chartCard} ${styles.fullWidth}`}>
              <div className={styles.chartTitle}>{t('a.chartEvolution')}</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} />
                  <Tooltip content={<CustomTooltip fmt={fmt} />} />
                  <Area type="monotone" dataKey="needs" name={t(PILLAR_KEYS.needs)} stackId="1" stroke={PC.needs} fill={PC.needs} fillOpacity={0.2} />
                  <Area type="monotone" dataKey="wants" name={t(PILLAR_KEYS.wants)} stackId="1" stroke={PC.wants} fill={PC.wants} fillOpacity={0.2} />
                  <Area type="monotone" dataKey="savings" name={t(PILLAR_KEYS.savings)} stackId="1" stroke={PC.savings} fill={PC.savings} fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Pie — current month */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>{t('a.chartPie')}</div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip fmt={fmt} />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.noData}>{t('a.noDataMonth')}</div>
              )}
            </div>

            {/* Daily spending */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>{t('a.chartDaily')}</div>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="day" tick={TICK} />
                    <YAxis tick={TICK} />
                    <Tooltip content={<CustomTooltip fmt={fmt} />} />
                    <Bar dataKey="amount" name={t('a.barSpent')} fill="#d4a843" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.noData}>{t('a.noDataMonth')}</div>
              )}
            </div>
          </div>

          {/* ── Category Ranking ── */}
          {categoryRanking.length > 0 && (
            <div className={styles.categorySection}>
              <h2 className={styles.sectionTitle}>{t('a.topCategories')}</h2>
              <div className={styles.categoryList}>
                {categoryRanking.map((c, i) => {
                  const maxSpent = categoryRanking[0]?.spent || 1;
                  const barPct = (c.spent / maxSpent) * 100;
                  const delta = c.prevSpent > 0 ? ((c.spent - c.prevSpent) / c.prevSpent) * 100 : 0;

                  return (
                    <div key={c.name} className={styles.categoryRow}>
                      <span className={styles.catRank}>{i + 1}</span>
                      <span className={styles.catIcon}>{iconToEmoji(c.icon)}</span>
                      <div className={styles.catMain}>
                        <div className={styles.catName}>{c.name}</div>
                        <div className={styles.catPillar}>{t(PILLAR_KEYS[c.pillar])}</div>
                      </div>
                      <div className={styles.catBarWrap}>
                        <ProgressBar percent={barPct} variant={c.pillar === 'needs' ? 'needs' : c.pillar === 'wants' ? 'wants' : 'savings'} />
                      </div>
                      <span className={styles.catAmount}>{fmt(c.spent)}</span>
                      {delta !== 0 && (
                        <span className={`${styles.catDelta} ${delta > 15 ? styles.valNegative : delta < -10 ? styles.valPositive : styles.valCaution}`}>
                          {pct(delta)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Insights ── */}
          {insights.length > 0 && (
            <div className={styles.insightsSection}>
              <h2 className={styles.sectionTitle}>{t('a.signals')}</h2>
              <div className={styles.insightsGrid}>
                {insights.map(ins => (
                  <div key={ins.id} className={`${styles.insightItem} ${
                    ins.tone === 'positive' ? styles.insightPositive :
                    ins.tone === 'caution' ? styles.insightCaution : styles.insightInfo
                  }`}>
                    <span className={styles.insightIcon}>
                      {ins.tone === 'positive' ? <TrendingUp size={14} /> :
                       ins.tone === 'caution' ? <AlertTriangle size={14} /> : <Zap size={14} />}
                    </span>
                    <span>{ins.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
