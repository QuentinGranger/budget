'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { computeSmartSplit } from '@/lib/budget-engine';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import styles from './onboarding.module.scss';

interface IncomeEntry {
  label: string;
  amount: string;
  type: string;
  frequency: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { dispatch, actions } = useStore();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Profile
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');

  // Step 2: Incomes
  const [incomes, setIncomes] = useState<IncomeEntry[]>([
    { label: '', amount: '', type: 'primary', frequency: 'monthly' },
  ]);

  // Step 3: Budget split
  const [financialGoal, setFinancialGoal] = useState('control');
  const [comfortLevel, setComfortLevel] = useState('moderate');
  const [disciplineLevel, setDisciplineLevel] = useState('moderate');
  const [incomeType, setIncomeType] = useState('stable');
  const [monthlyFixedExpenses, setMonthlyFixedExpenses] = useState('');

  const totalIncome = incomes.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const split = computeSmartSplit({
    totalIncome,
    monthlyFixedExpenses: parseFloat(monthlyFixedExpenses) || 0,
    financialGoal,
    comfortLevel,
    incomeType,
    disciplineLevel,
  });

  const addIncome = () => setIncomes([...incomes, { label: '', amount: '', type: 'secondary', frequency: 'monthly' }]);
  const removeIncome = (i: number) => setIncomes(incomes.filter((_, idx) => idx !== i));
  const updateIncome = (i: number, field: keyof IncomeEntry, value: string) => {
    const copy = [...incomes];
    copy[i] = { ...copy[i], [field]: value };
    setIncomes(copy);
  };

  const handleFinish = async () => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/user/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          currency,
          incomes: incomes.filter((i) => i.label && parseFloat(i.amount) > 0).map((i) => ({
            label: i.label,
            amount: parseFloat(i.amount),
            type: i.type,
            frequency: i.frequency,
          })),
          settings: {
            needsPercent: split.needs,
            wantsPercent: split.wants,
            savingsPercent: split.savings,
            financialGoal,
            comfortLevel,
            disciplineLevel,
            incomeType,
            monthlyFixedExpenses: parseFloat(monthlyFixedExpenses) || 0,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t('o.error'));
        setLoading(false);
        return;
      }

      // Refresh user data in store so AppShell sees onboarded=true
      await actions.fetchUser(dispatch);
      router.push('/dashboard');
    } catch {
      setError(t('o.networkError'));
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img src="/blason.png" alt="" style={{ width: 64, height: 64, marginBottom: 14, filter: 'drop-shadow(0 4px 16px rgba(212,168,67,0.3))' }} />
          <h1>{t('o.welcome')}</h1>
          <p>{t('o.subtitle')}</p>
        </div>

        <div className={styles.steps}>
          {[1, 2, 3].map((s) => (
            <div key={s} className={`${styles.step} ${s === step ? styles.stepActive : s < step ? styles.stepDone : ''}`} />
          ))}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {step === 1 && (
          <div className={styles.form}>
            <div className={styles.field}>
              <label>{t('o.yourName')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('o.namePlaceholder')} />
            </div>
            <div className={styles.field}>
              <label>{t('o.currency')}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
              </select>
            </div>
            <div className={styles.actions}>
              <button className={styles.nextBtn} onClick={() => setStep(2)} disabled={!name.trim()}>
                {t('o.next')}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.form}>
            {incomes.map((inc, i) => (
              <div key={i} className={styles.incomeRow}>
                <div className={styles.field}>
                  <label>{t('o.label')}</label>
                  <input type="text" value={inc.label} onChange={(e) => updateIncome(i, 'label', e.target.value)} placeholder={t('o.salaryDefault')} />
                </div>
                <div className={styles.field}>
                  <label>{t('o.amount')}</label>
                  <input type="number" value={inc.amount} onChange={(e) => updateIncome(i, 'amount', e.target.value)} placeholder="2500" />
                </div>
                {incomes.length > 1 && (
                  <button className={styles.removeBtn} onClick={() => removeIncome(i)} type="button">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            <button className={styles.addBtn} onClick={addIncome} type="button">{t('o.addIncome')}</button>
            <div className={styles.actions}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>{t('o.back')}</button>
              <button className={styles.nextBtn} onClick={() => setStep(3)} disabled={totalIncome <= 0}>
                {t('o.next')}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.form}>
            <div className={styles.field}>
              <label>{t('o.rent')}</label>
              <input type="number" value={monthlyFixedExpenses} onChange={(e) => setMonthlyFixedExpenses(e.target.value)} placeholder="800" />
            </div>
            <div className={styles.field}>
              <label>{t('o.incomeType')}</label>
              <select value={incomeType} onChange={(e) => setIncomeType(e.target.value)}>
                <option value="stable">{t('o.incomeStable')}</option>
                <option value="variable">{t('o.incomeVariable')}</option>
                <option value="mixed">{t('o.incomeMixed')}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>{t('o.goal')}</label>
              <select value={financialGoal} onChange={(e) => setFinancialGoal(e.target.value)}>
                <option value="control">{t('o.goalControl')}</option>
                <option value="save">{t('o.goalSave')}</option>
                <option value="debt">{t('o.goalDebt')}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>{t('o.comfort')}</label>
              <select value={comfortLevel} onChange={(e) => setComfortLevel(e.target.value)}>
                <option value="tight">{t('o.comfortTight')}</option>
                <option value="moderate">{t('o.comfortModerate')}</option>
                <option value="spacious">{t('o.comfortSpacious')}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>{t('o.discipline')}</label>
              <select value={disciplineLevel} onChange={(e) => setDisciplineLevel(e.target.value)}>
                <option value="relaxed">{t('o.discRelaxed')}</option>
                <option value="moderate">{t('o.discModerate')}</option>
                <option value="strict">{t('o.discStrict')}</option>
              </select>
            </div>

            {/* Profile badges */}
            <div className={styles.profileBadges}>
              <span className={`${styles.profileBadge} ${split.incomeProfile === 'low' ? styles.badgeLow : split.incomeProfile === 'medium' ? styles.badgeMedium : styles.badgeHigh}`}>
                {t(`b.income${split.incomeProfile === 'low' ? 'Low' : split.incomeProfile === 'medium' ? 'Medium' : 'High'}`)}
              </span>
              <span className={`${styles.profileBadge} ${split.pressureLevel === 'critical' ? styles.badgeCritical : split.pressureLevel === 'high' ? styles.badgeLow : split.pressureLevel === 'moderate' ? styles.badgeMedium : styles.badgeHigh}`}>
                {t(`b.pressure${split.pressureLevel === 'critical' ? 'Critical' : split.pressureLevel === 'high' ? 'High' : split.pressureLevel === 'moderate' ? 'Moderate' : 'Low'}`)}
              </span>
            </div>

            {/* Reste à vivre */}
            {split.resteAVivre > 0 && (
              <div className={styles.resteAVivre}>
                <div className={styles.ravValue}>{Math.round(split.resteAVivre)} {currency}</div>
                <div className={styles.ravLabel}>{t('o.ravLabel')}</div>
                <div className={styles.ravDaily}>{t('o.ravDaily', { daily: Math.round(split.resteAVivre / 30), currency })}</div>
              </div>
            )}

            {/* Split percentages */}
            <div className={styles.splitPreview}>
              <div className={`${styles.splitBox} ${styles.needsBox}`}>
                <div className={`${styles.splitPercent} ${styles.needsSplit}`}>{split.needs}%</div>
                <div className={styles.splitLabel}>{t('d.needs')}</div>
              </div>
              <div className={`${styles.splitBox} ${styles.wantsBox}`}>
                <div className={`${styles.splitPercent} ${styles.wantsSplit}`}>{split.wants}%</div>
                <div className={styles.splitLabel}>{t('d.wants')}</div>
              </div>
              <div className={`${styles.splitBox} ${styles.savingsBox}`}>
                <div className={`${styles.splitPercent} ${styles.savingsSplit}`}>{split.savings}%</div>
                <div className={styles.splitLabel}>{t('d.savings')}</div>
              </div>
            </div>

            {/* Split amounts */}
            <div className={styles.splitAmounts}>
              <div className={styles.splitAmountBox}>
                <div className={`${styles.splitAmountValue} ${styles.needsSplit}`}>{Math.round(totalIncome * split.needs / 100)} {currency}</div>
                <div className={styles.splitAmountLabel}>{t('d.needs')}</div>
              </div>
              <div className={styles.splitAmountBox}>
                <div className={`${styles.splitAmountValue} ${styles.wantsSplit}`}>{Math.round(totalIncome * split.wants / 100)} {currency}</div>
                <div className={styles.splitAmountLabel}>{t('d.wants')}</div>
              </div>
              <div className={styles.splitAmountBox}>
                <div className={`${styles.splitAmountValue} ${styles.savingsSplit}`}>{Math.round(totalIncome * split.savings / 100)} {currency}</div>
                <div className={styles.splitAmountLabel}>{t('d.savings')}</div>
              </div>
            </div>

            {/* Reasoning */}
            {split.reasoning.length > 0 && (
              <div className={styles.reasoning}>
                <div className={styles.reasoningTitle}>{t('o.reasoningTitle')}</div>
                {split.reasoning.map((r, i) => (
                  <div key={i} className={`${styles.reasonItem} ${r.startsWith('\u26A0') ? styles.warning : ''}`}>{r}</div>
                ))}
              </div>
            )}

            <div className={styles.actions}>
              <button className={styles.backBtn} onClick={() => setStep(2)}>{t('o.back')}</button>
              <button className={styles.nextBtn} onClick={handleFinish} disabled={loading}>
                {loading ? t('o.loading') : t('o.start')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
