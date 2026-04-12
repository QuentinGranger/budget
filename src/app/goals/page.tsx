'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Target, TrendingUp, AlertTriangle, Zap, CalendarDays, PiggyBank } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import ProgressBar from '@/components/ui/ProgressBar/ProgressBar';
import Modal, { useConfirm } from '@/components/Modal/Modal';
import styles from './goals.module.scss';

const GOAL_ICONS = ['🎯', '🏖️', '🏠', '🚗', '💰', '📈', '🎓', '💳', '🛡️', '✈️', '💍', '🔧'];

interface GoalForm {
  id?: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string;
  icon: string;
}

const emptyForm: GoalForm = {
  name: '',
  targetAmount: '',
  currentAmount: '0',
  targetDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
  icon: '🎯',
};

function monthsBetween(from: Date, to: Date): number {
  return Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}

function goalIcon(g: { icon: string }): string {
  if (GOAL_ICONS.includes(g.icon)) return g.icon;
  return '🎯';
}

export default function GoalsPage() {
  const { state, dispatch, actions, snapshot } = useStore();
  const { t, dateLocale } = useI18n();
  const user = state.user;

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<GoalForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const goals = user?.goals || [];
  const currency = user?.currency || 'EUR';
  const fmt = (n: number) => n.toLocaleString(dateLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const savingsPillar = snapshot?.pillars.savings;

  // ── Goal analytics ──
  const goalAnalytics = useMemo(() => {
    return goals.map(g => {
      const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
      const remaining = Math.max(0, g.targetAmount - g.currentAmount);
      const isComplete = pct >= 100;
      const now = new Date();
      const target = new Date(g.targetDate);
      const monthsLeft = monthsBetween(now, target);
      const isPast = target < now && !isComplete;
      const monthlyRequired = remaining > 0 ? remaining / monthsLeft : 0;

      let trajectory: 'complete' | 'on-track' | 'behind' | 'critical' = 'on-track';
      if (isComplete) trajectory = 'complete';
      else if (isPast) trajectory = 'critical';
      else if (savingsPillar && monthlyRequired > savingsPillar.budgeted * 0.6) trajectory = 'behind';

      return { ...g, pct, remaining, isComplete, monthsLeft, isPast, monthlyRequired, trajectory };
    });
  }, [goals, savingsPillar]);

  // ── Summary KPIs ──
  const summary = useMemo(() => {
    const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
    const totalCurrent = goals.reduce((s, g) => s + g.currentAmount, 0);
    const totalRemaining = Math.max(0, totalTarget - totalCurrent);
    const totalMonthlyRequired = goalAnalytics.reduce((s, g) => s + g.monthlyRequired, 0);
    const closest = goalAnalytics.filter(g => !g.isComplete).sort((a, b) => a.remaining - b.remaining)[0] || null;
    const critical = goalAnalytics.filter(g => g.trajectory === 'critical' || g.trajectory === 'behind');
    return { totalTarget, totalCurrent, totalRemaining, totalMonthlyRequired, closest, criticalCount: critical.length, activeCount: goals.filter(g => goalAnalytics.find(a => a.id === g.id && !a.isComplete)).length };
  }, [goals, goalAnalytics]);

  // ── Smart insights ──
  const insights = useMemo(() => {
    const msgs: { id: string; message: string; tone: 'positive' | 'caution' | 'info' }[] = [];
    if (!snapshot || goals.length === 0) return msgs;

    const completeCount = goalAnalytics.filter(g => g.isComplete).length;
    if (completeCount > 0) {
      msgs.push({ id: 'complete', message: t('g.insightComplete', { count: completeCount, s: completeCount > 1 ? 's' : '' }), tone: 'positive' });
    }

    if (savingsPillar && summary.totalMonthlyRequired > 0) {
      const pctOfSavings = savingsPillar.budgeted > 0 ? (summary.totalMonthlyRequired / savingsPillar.budgeted) * 100 : 0;
      if (pctOfSavings > 100) {
        msgs.push({ id: 'savings-short', message: t('g.insightSavingsShort', { required: fmt(summary.totalMonthlyRequired), budget: fmt(savingsPillar.budgeted) }), tone: 'caution' });
      } else if (pctOfSavings > 70) {
        msgs.push({ id: 'savings-tight', message: t('g.insightSavingsTight', { pct: Math.round(pctOfSavings) }), tone: 'info' });
      } else {
        msgs.push({ id: 'savings-ok', message: t('g.insightSavingsOk', { amount: fmt(savingsPillar.budgeted - summary.totalMonthlyRequired) }), tone: 'positive' });
      }
    }

    const behindGoals = goalAnalytics.filter(g => g.trajectory === 'behind');
    for (const g of behindGoals.slice(0, 2)) {
      msgs.push({ id: `behind-${g.id}`, message: t('g.insightBehind', { name: g.name, amount: fmt(g.monthlyRequired) }), tone: 'caution' });
    }

    const almostDone = goalAnalytics.filter(g => g.pct >= 80 && !g.isComplete);
    for (const g of almostDone.slice(0, 1)) {
      msgs.push({ id: `almost-${g.id}`, message: t('g.insightAlmost', { name: g.name, pct: Math.round(g.pct), remaining: fmt(g.remaining) }), tone: 'positive' });
    }

    return msgs;
  }, [snapshot, goals, goalAnalytics, savingsPillar, summary, currency]);

  // ── Impact preview (in modal) ──
  const impact = useMemo(() => {
    if (!snapshot || !form.targetAmount) return null;
    const target = parseFloat(form.targetAmount) || 0;
    const current = parseFloat(form.currentAmount) || 0;
    if (target <= 0) return null;
    const remaining = Math.max(0, target - current);
    const targetDate = new Date(form.targetDate);
    const months = monthsBetween(new Date(), targetDate);
    const monthlyNeeded = remaining / months;
    const savBudget = savingsPillar?.budgeted || 0;
    const otherGoalsMonthly = goalAnalytics
      .filter(g => g.id !== form.id && !g.isComplete)
      .reduce((s, g) => s + g.monthlyRequired, 0);
    const totalAfter = otherGoalsMonthly + monthlyNeeded;
    const isOver = savBudget > 0 && totalAfter > savBudget;
    return { monthlyNeeded, totalAfter, savBudget, isOver, months };
  }, [snapshot, form.targetAmount, form.currentAmount, form.targetDate, form.id, savingsPillar, goalAnalytics]);

  // ── Handlers ──
  const openNew = () => { setForm(emptyForm); setShowModal(true); };

  const openEdit = (g: typeof goals[0]) => {
    setForm({
      id: g.id,
      name: g.name,
      targetAmount: String(g.targetAmount),
      currentAmount: String(g.currentAmount),
      targetDate: new Date(g.targetDate).toISOString().slice(0, 10),
      icon: g.icon || '🎯',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        name: form.name,
        targetAmount: parseFloat(form.targetAmount),
        currentAmount: parseFloat(form.currentAmount),
        targetDate: form.targetDate,
        icon: form.icon,
      };
      if (form.id) {
        await actions.updateGoal(dispatch, { id: form.id, ...data } as never);
      } else {
        await actions.createGoal(dispatch, data as never);
      }
      setShowModal(false);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const { confirm, modalProps } = useConfirm();

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t('g.deleteTitle'),
      message: t('g.deleteMessage'),
      confirmLabel: t('g.delete'),
      variant: 'danger',
    });
    if (!ok) return;
    await actions.deleteGoal(dispatch, id);
  };

  const trajectoryLabel = (tr: string) => {
    switch (tr) {
      case 'complete': return t('g.trajComplete');
      case 'on-track': return t('g.trajOnTrack');
      case 'behind': return t('g.trajBehind');
      case 'critical': return t('g.trajCritical');
      default: return '';
    }
  };

  const trajectoryClass = (tr: string) => {
    switch (tr) {
      case 'complete': return styles.trajComplete;
      case 'on-track': return styles.trajOnTrack;
      case 'behind': return styles.trajBehind;
      case 'critical': return styles.trajCritical;
      default: return '';
    }
  };

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <h1>{t('g.title')}</h1>
        <button className={styles.addBtn} onClick={openNew}>
          <Plus size={16} /> {t('g.add')}
        </button>
      </div>

      {goals.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><Target size={48} /></div>
          <div className={styles.emptyTitle}>{t('g.emptyTitle')}</div>
          <div className={styles.emptyText}>
            {t('g.emptyText')}
          </div>
          <button className={styles.emptyAction} onClick={openNew}>
            <Plus size={16} /> {t('g.createGoal')}
          </button>
        </div>
      ) : (
        <>
          {/* ── Summary Strip ── */}
          <div className={styles.summaryStrip}>
            <div className={styles.summaryItem}>
              <div className={`${styles.summaryValue} ${styles.valGold}`}>{fmt(summary.totalCurrent)}</div>
              <div className={styles.summaryLabel}>{t('g.totalSaved')}</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{fmt(summary.totalTarget)}</div>
              <div className={styles.summaryLabel}>{t('g.totalTarget')}</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={styles.summaryValue}>{fmt(summary.totalRemaining)}</div>
              <div className={styles.summaryLabel}>{t('g.remaining')}</div>
            </div>
            <div className={styles.summaryItem}>
              <div className={`${styles.summaryValue} ${summary.totalMonthlyRequired > (savingsPillar?.budgeted || Infinity) ? styles.valNegative : styles.valPositive}`}>
                {fmt(summary.totalMonthlyRequired)}
              </div>
              <div className={styles.summaryLabel}>{t('g.monthlyContrib')}</div>
            </div>
          </div>

          {/* ── Savings Context ── */}
          {savingsPillar && (
            <div className={styles.savingsStrip}>
              <div className={styles.savItem}>
                <PiggyBank size={13} className={styles.savIcon} />
                <span className={styles.savLabel}>{t('g.savBudgeted')}</span>
                <span className={styles.savValue}>{fmt(savingsPillar.budgeted)}</span>
              </div>
              <div className={styles.savDivider} />
              <div className={styles.savItem}>
                <span className={styles.savLabel}>{t('g.savAlready')}</span>
                <span className={styles.savValue}>{fmt(savingsPillar.spent)}</span>
              </div>
              <div className={styles.savDivider} />
              <div className={styles.savItem}>
                <span className={styles.savLabel}>{t('g.savCommitted')}</span>
                <span className={styles.savValue}>{fmt(summary.totalMonthlyRequired)}</span>
              </div>
              <div className={styles.savDivider} />
              <div className={styles.savItem}>
                <span className={styles.savLabel}>{t('g.savFreeMargin')}</span>
                <span className={`${styles.savValue} ${savingsPillar.budgeted - summary.totalMonthlyRequired >= 0 ? styles.valPositive : styles.valNegative}`}>
                  {fmt(Math.max(0, savingsPillar.budgeted - summary.totalMonthlyRequired))}
                </span>
              </div>
            </div>
          )}

          {/* ── Goal Cards ── */}
          <div className={styles.grid}>
            {goalAnalytics.map(g => (
              <div key={g.id} className={`${styles.goalCard} ${g.isComplete ? styles.goalCardComplete : ''}`}>
                <div className={styles.goalTop}>
                  <div className={styles.goalInfo}>
                    <span className={styles.goalIcon}>{goalIcon(g)}</span>
                    <div className={styles.goalNameWrap}>
                      <div className={styles.goalName}>{g.name}</div>
                      <div className={styles.goalType}>{t('g.typeSavings')}</div>
                    </div>
                  </div>
                  <div className={styles.goalActions}>
                    <button className={styles.actionBtn} onClick={() => openEdit(g)}>
                      <Pencil size={13} />
                    </button>
                    <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={(e) => handleDelete(g.id, e)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className={styles.goalAmounts}>
                  <span className={styles.goalCurrent}>{fmt(g.currentAmount)}</span>
                  <span className={styles.goalTarget}>/ {fmt(g.targetAmount)}</span>
                </div>

                <div className={styles.goalBar}>
                  <ProgressBar percent={Math.min(g.pct, 100)} variant={g.isComplete ? 'savings' : 'gold'} />
                </div>

                <div className={styles.goalFooter}>
                  <span className={styles.goalRemaining}>
                    {g.isComplete ? t('g.goalReached') : t('g.xRemaining', { amount: fmt(g.remaining) })}
                  </span>
                  <span className={`${styles.goalTrajectory} ${trajectoryClass(g.trajectory)}`}>
                    {trajectoryLabel(g.trajectory)}
                  </span>
                </div>

                <div className={styles.goalMeta}>
                  <div className={styles.goalMetaItem}>
                    <CalendarDays size={11} />
                    <span>{g.isPast ? t('g.deadlinePassed') : t('g.xMonths', { n: g.monthsLeft })}</span>
                  </div>
                  {!g.isComplete && (
                    <div className={styles.goalMetaItem}>
                      <span>{t('g.perMonth', { amount: fmt(g.monthlyRequired) })}</span>
                    </div>
                  )}
                  <div className={styles.goalMetaItem}>
                    <span className={styles.goalMetaValue}>{Math.round(g.pct)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Smart Insights ── */}
          {insights.length > 0 && (
            <div className={styles.insightsSection}>
              <h2 className={styles.sectionTitle}>{t('g.signals')}</h2>
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

      {/* ── Modal ── */}
      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? t('g.editTitle') : t('g.newTitle')}</h2>
            <div className={styles.form}>
              <div className={styles.field}>
                <label>{t('g.name')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t('g.namePlaceholder')}
                />
              </div>

              <div className={styles.field}>
                <label>{t('g.icon')}</label>
                <div className={styles.iconPicker}>
                  {GOAL_ICONS.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      className={`${styles.iconOption} ${form.icon === icon ? styles.iconSelected : ''}`}
                      onClick={() => setForm({ ...form, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>{t('g.targetAmount')}</label>
                  <input
                    type="number"
                    value={form.targetAmount}
                    onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                    placeholder="5000"
                    min="0"
                    step="100"
                  />
                </div>
                <div className={styles.field}>
                  <label>{t('g.targetDate')}</label>
                  <input
                    type="date"
                    value={form.targetDate}
                    onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                  />
                </div>
              </div>

              {form.id && (
                <div className={styles.field}>
                  <label>{t('g.currentAmount')}</label>
                  <input
                    type="number"
                    value={form.currentAmount}
                    onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
                    placeholder="0"
                    min="0"
                    step="50"
                  />
                </div>
              )}

              {/* ── Impact Preview ── */}
              {impact && (
                <div className={`${styles.impactPreview} ${impact.isOver ? styles.impactWarn : styles.impactOk}`}>
                  <div className={styles.impactHeader}>{t('g.impactTitle')}</div>
                  <div className={styles.impactRow}>
                    <span className={styles.impactLabel}>{t('g.impactMonthly')}</span>
                    <span className={`${styles.impactValue} ${impact.isOver ? styles.impactBad : styles.impactGood}`}>
                      {fmt(impact.monthlyNeeded)}
                    </span>
                  </div>
                  <div className={styles.impactRow}>
                    <span className={styles.impactLabel}>{t('g.impactDuration')}</span>
                    <span className={styles.impactValue}>{t('g.impactDurationVal', { n: impact.months })}</span>
                  </div>
                  {impact.savBudget > 0 && (
                    <div className={styles.impactRow}>
                      <span className={styles.impactLabel}>{t('g.impactTotal')}</span>
                      <span className={`${styles.impactValue} ${impact.isOver ? styles.impactBad : styles.impactGood}`}>
                        {fmt(impact.totalAfter)} / {fmt(impact.savBudget)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>{t('g.cancel')}</button>
                <button
                  className={styles.saveBtn}
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.targetAmount}
                >
                  {saving ? t('g.saving') : t('g.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Modal {...modalProps} />
    </div>
  );
}
