'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { computeSmartSplit } from '@/lib/budget-engine';
import { useI18n } from '@/lib/i18n';
import { iconToEmoji } from '@/lib/icon-map';
import {
  User, Wallet, Tag, Shield, Bell, Database, Palette, HelpCircle,
  Zap, Lightbulb, AlertTriangle, Check, ArrowRight, Plus, Trash2,
  Lock, Smartphone, LogOut, Download, ShieldCheck, ShieldAlert,
  Calendar, TrendingUp, RefreshCw,
} from 'lucide-react';
import Modal, { useConfirm } from '@/components/Modal/Modal';
import styles from './settings.module.scss';

// ── Types ──
type Tab = 'profile' | 'financial' | 'categories' | 'security' | 'notifications' | 'data' | 'appearance' | 'help';

interface Toast { message: string; type: 'success' | 'error' }

const PILLAR_KEYS: Record<string, string> = { needs: 'd.needs', wants: 'd.wants', savings: 'd.savings' };

const NAV_ICONS: Record<Tab, React.ReactNode> = {
  profile: <User size={16} />,
  financial: <Wallet size={16} />,
  categories: <Tag size={16} />,
  security: <Shield size={16} />,
  notifications: <Bell size={16} />,
  data: <Database size={16} />,
  appearance: <Palette size={16} />,
  help: <HelpCircle size={16} />,
};

const NAV_KEYS: Record<Tab, string> = {
  profile: 's.navProfile',
  financial: 's.navFinancial',
  categories: 's.navCategories',
  security: 's.navSecurity',
  notifications: 's.navNotifications',
  data: 's.navData',
  appearance: 's.navAppearance',
  help: 's.navHelp',
};

const TAB_ORDER: Tab[] = ['profile', 'financial', 'categories', 'security', 'notifications', 'data', 'appearance', 'help'];

export default function SettingsPage() {
  const router = useRouter();
  const { state, dispatch, actions } = useStore();
  const { t, dateLocale } = useI18n();
  const user = state.user;
  const settings = user?.settings;

  const [tab, setTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // ── Profile ──
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');

  // ── Financial ──
  const [needsPercent, setNeedsPercent] = useState(50);
  const [wantsPercent, setWantsPercent] = useState(30);
  const [savingsPercent, setSavingsPercent] = useState(20);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [financialGoal, setFinancialGoal] = useState('control');
  const [comfortLevel, setComfortLevel] = useState('moderate');
  const [disciplineLevel, setDisciplineLevel] = useState('moderate');
  const [incomeType, setIncomeType] = useState('stable');
  const [tolerancePercent, setTolerancePercent] = useState(5);
  const [strictMode, setStrictMode] = useState(false);
  const [budgetStartDay, setBudgetStartDay] = useState(1);

  // ── Categories ──
  const [newCatName, setNewCatName] = useState('');
  const [newCatPillar, setNewCatPillar] = useState('needs');
  const [newCatIcon, setNewCatIcon] = useState('circle');

  // ── Security ──
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [twoFAStep, setTwoFAStep] = useState<'idle' | 'setup' | 'verify'>('idle');
  const { confirm, modalProps } = useConfirm();

  // ── Computed ──
  const totalIncome = useMemo(() => {
    if (!user?.incomes) return 0;
    return user.incomes.filter((i: { isActive: boolean }) => i.isActive).reduce((s: number, i: { amount: number }) => s + i.amount, 0);
  }, [user?.incomes]);

  const split = useMemo(() => computeSmartSplit({
    totalIncome,
    monthlyFixedExpenses: monthlyRent,
    financialGoal,
    comfortLevel,
    incomeType,
    disciplineLevel,
  }), [totalIncome, monthlyRent, financialGoal, comfortLevel, incomeType, disciplineLevel]);

  const categories = user?.categories || [];
  const fmt = useCallback((n: number) => n.toLocaleString(dateLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }), [currency, dateLocale]);

  const securityScore = useMemo(() => {
    let score = 1; // base: has account
    if (user?.totpEnabled) score += 2;
    if (user?.emailVerified) score += 1;
    return score; // max 4
  }, [user?.totpEnabled, user?.emailVerified]);

  // ── Sync form state from store ──
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setCurrency(user.currency || 'EUR');
    }
    if (settings) {
      setNeedsPercent(settings.needsPercent);
      setWantsPercent(settings.wantsPercent);
      setSavingsPercent(settings.savingsPercent);
      setMonthlyRent(settings.monthlyFixedExpenses || 0);
      setFinancialGoal(settings.financialGoal || 'control');
      setComfortLevel(settings.comfortLevel || 'moderate');
      setDisciplineLevel(settings.disciplineLevel || 'moderate');
      setIncomeType(settings.incomeType || 'stable');
      setTolerancePercent(settings.tolerancePercent ?? 5);
      setStrictMode(settings.strictMode ?? false);
      setBudgetStartDay(settings.budgetStartDay ?? 1);
    }
  }, [user, settings]);

  // ── Toast auto-clear ──
  useEffect(() => {
    if (!toast) return;
    const tid = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(tid);
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  // ── Actions ──
  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await actions.updateProfile(dispatch, { name, currency });
      showToast(t('s.toastProfileSaved'));
    } catch { showToast(t('s.toastSaveError'), 'error'); }
    setSaving(false);
  };

  const handleSaveBudget = async () => {
    const total = needsPercent + wantsPercent + savingsPercent;
    if (total !== 100) {
      showToast(t('s.sumToastError', { n: total }), 'error');
      return;
    }
    setSaving(true);
    try {
      await actions.updateSettings(dispatch, {
        needsPercent, wantsPercent, savingsPercent,
        monthlyFixedExpenses: monthlyRent,
        financialGoal, comfortLevel, disciplineLevel, incomeType,
        tolerancePercent, strictMode, budgetStartDay,
      });
      showToast(t('s.toastFinSaved'));
    } catch { showToast(t('s.toastSaveError'), 'error'); }
    setSaving(false);
  };

  const applySmartSplit = () => {
    setNeedsPercent(split.needs);
    setWantsPercent(split.wants);
    setSavingsPercent(split.savings);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await actions.createCategory(dispatch, { name: newCatName.trim(), icon: newCatIcon, pillar: newCatPillar });
      setNewCatName('');
      setNewCatIcon('circle');
      showToast(t('s.toastCatAdded'));
    } catch { showToast(t('s.toastCatCreateError'), 'error'); }
  };

  const handleDeleteCategory = async (id: string, catName: string) => {
    const ok = await confirm({
      title: t('s.confirmDeleteCat'),
      message: t('s.confirmDeleteCatMsg', { name: catName }),
      confirmLabel: t('s.confirmDeleteBtn'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await actions.deleteCategory(dispatch, id);
      showToast(t('s.toastCatDeleted'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('s.toastError'), 'error');
    }
  };

  const handleSetup2FA = async () => {
    setTwoFAStep('setup');
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || t('s.toastError'), 'error'); setTwoFAStep('idle'); return; }
      setQrCode(data.qrCode);
      setTwoFAStep('verify');
    } catch { showToast(t('s.toastNetworkError'), 'error'); setTwoFAStep('idle'); }
  };

  const handleEnable2FA = async () => {
    if (totpCode.length !== 6) { showToast(t('s.toast6Digits'), 'error'); return; }
    try {
      const res = await fetch('/api/auth/2fa/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: totpCode }) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || t('s.toastInvalidCode'), 'error'); return; }
      showToast(t('s.toast2FAEnabled'));
      setTwoFAStep('idle');
      setQrCode(null);
      setTotpCode('');
      actions.fetchUser(dispatch);
    } catch { showToast(t('s.toastNetworkError'), 'error'); }
  };

  const handleDisable2FA = async () => {
    const ok = await confirm({
      title: t('s.confirmDisable2FA'),
      message: t('s.confirmDisable2FAMsg'),
      confirmLabel: t('s.confirmDisableBtn'),
      variant: 'warn',
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/auth/2fa/disable', { method: 'POST' });
      if (!res.ok) { showToast(t('s.toastError'), 'error'); return; }
      showToast(t('s.toast2FADisabled'));
      actions.fetchUser(dispatch);
    } catch { showToast(t('s.toastNetworkError'), 'error'); }
  };

  const handleLogoutAll = async () => {
    const ok = await confirm({
      title: t('s.confirmLogoutAll'),
      message: t('s.confirmLogoutAllMsg'),
      confirmLabel: t('s.confirmLogoutBtn'),
      variant: 'warn',
    });
    if (!ok) return;
    await fetch('/api/auth/logout-all', { method: 'POST' });
    router.push('/login');
  };

  const handleDeleteAccount = async () => {
    const first = await confirm({
      title: t('s.confirmDeleteAccount'),
      message: t('s.confirmDeleteAccountMsg'),
      confirmLabel: t('s.confirmContinue'),
      variant: 'danger',
    });
    if (!first) return;
    const second = await confirm({
      title: t('s.confirmLastChance'),
      message: t('s.confirmLastChanceMsg'),
      confirmLabel: t('s.confirmDeleteForever'),
      variant: 'danger',
    });
    if (!second) return;
    try {
      await actions.deleteAccount();
      router.push('/login');
    } catch { showToast(t('s.toastDeleteError'), 'error'); }
  };

  const handleExportData = async () => {
    showToast(t('s.toastExporting'));
    try {
      const [userRes, txRes] = await Promise.all([
        fetch('/api/user'),
        fetch('/api/transactions'),
      ]);
      const userData = await userRes.json();
      const transactions = txRes.ok ? await txRes.json() : [];
      const exportData = { ...userData, transactions };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `capbudget-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('s.toastExported'));
    } catch { showToast(t('s.toastExportError'), 'error'); }
  };

  if (!user) return null;

  // ── Render Sections ──
  const renderProfile = () => (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t('s.navProfile')}</h2>
        <p className={styles.sectionDesc}>{t('s.profileDesc')}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><User size={15} /> {t('s.personalInfo')}</div>
        <div className={styles.cardDesc}>{t('s.personalInfoDesc')}</div>
        <div className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>{t('s.name')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('s.namePlaceholder')} />
            </div>
            <div className={styles.field}>
              <label>{t('s.currency')}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="EUR">{t('s.eurLabel')}</option>
                <option value="USD">{t('s.usdLabel')}</option>
                <option value="GBP">{t('s.gbpLabel')}</option>
                <option value="CHF">{t('s.chfLabel')}</option>
              </select>
              <span className={styles.fieldImpact}><ArrowRight /> {t('s.impactAll')}</span>
            </div>
          </div>
          <div className={styles.field}>
            <label>{t('s.email')}</label>
            <input type="email" value={user.email} disabled />
            <span className={styles.fieldHint}>{t('s.emailHint')}</span>
          </div>
          <div className={styles.btnRow}>
            <button className={styles.btnPrimary} onClick={handleSaveProfile} disabled={saving}>
              {saving ? t('s.saving') : t('s.save')}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const renderFinancial = () => (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t('s.navFinancial')}</h2>
        <p className={styles.sectionDesc}>{t('s.finDesc')}</p>
      </div>

      {/* Core params */}
      <div className={styles.card}>
        <div className={styles.cardTitle}><Calendar size={15} /> {t('s.baseParams')}</div>
        <div className={styles.cardDesc}>{t('s.baseParamsDesc')}</div>
        <div className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>{t('s.rent')}</label>
              <input type="number" value={monthlyRent} onChange={(e) => setMonthlyRent(parseInt(e.target.value) || 0)} min={0} />
              <span className={styles.fieldImpact}><ArrowRight /> {t('s.rentImpact')}</span>
            </div>
            <div className={styles.field}>
              <label>{t('s.budgetStartDay')}</label>
              <select value={budgetStartDay} onChange={(e) => setBudgetStartDay(parseInt(e.target.value))}>
                {[1, 5, 10, 15, 20, 25].map(d => <option key={d} value={d}>{d === 1 ? t('s.firstOfMonth') : t('s.dayOfMonth', { d })}</option>)}
              </select>
              <span className={styles.fieldImpact}><ArrowRight /> {t('s.startDayImpact')}</span>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>{t('s.incomeTypeLabel')}</label>
              <select value={incomeType} onChange={(e) => setIncomeType(e.target.value)}>
                <option value="stable">{t('s.incomeStable')}</option>
                <option value="variable">{t('s.incomeVariable')}</option>
                <option value="mixed">{t('s.incomeMixed')}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>{t('s.goalLabel')}</label>
              <select value={financialGoal} onChange={(e) => setFinancialGoal(e.target.value)}>
                <option value="control">{t('s.goalControl')}</option>
                <option value="save">{t('s.goalSave')}</option>
                <option value="debt">{t('s.goalDebt')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Budget mode */}
      <div className={styles.card}>
        <div className={styles.cardTitle}><Wallet size={15} /> {t('s.budgetMode')}</div>
        <div className={styles.cardDesc}>{t('s.budgetModeDesc')}</div>
        <div className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>{t('s.comfort')}</label>
              <select value={comfortLevel} onChange={(e) => setComfortLevel(e.target.value)}>
                <option value="tight">{t('s.comfortTight')}</option>
                <option value="moderate">{t('s.comfortModerate')}</option>
                <option value="spacious">{t('s.comfortSpacious')}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>{t('s.discipline')}</label>
              <select value={disciplineLevel} onChange={(e) => setDisciplineLevel(e.target.value)}>
                <option value="relaxed">{t('s.discRelaxed')}</option>
                <option value="moderate">{t('s.discModerate')}</option>
                <option value="strict">{t('s.discStrict')}</option>
              </select>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>{t('s.tolerance')}</label>
              <select value={tolerancePercent} onChange={(e) => setTolerancePercent(parseInt(e.target.value))}>
                {[0, 2, 5, 10, 15].map(v => <option key={v} value={v}>{v}%</option>)}
              </select>
              <span className={styles.fieldHint}>{t('s.toleranceHint')}</span>
            </div>
            <div className={styles.field}>
              <label>{t('s.strictMode')}</label>
              <div style={{ paddingTop: 4 }}>
                <button className={`${styles.toggle} ${strictMode ? styles.toggleOn : ''}`} onClick={() => setStrictMode(!strictMode)} />
              </div>
              <span className={styles.fieldHint}>{strictMode ? t('s.strictModeOn') : t('s.strictModeOff')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile badges */}
      {totalIncome > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}><TrendingUp size={15} /> {t('s.profileAnalysis')}</div>
          <div className={styles.badges}>
            <span className={`${styles.badge} ${split.incomeProfile === 'low' ? styles.badgeLow : split.incomeProfile === 'medium' ? styles.badgeMedium : styles.badgeHigh}`}>
              {t(`b.income${split.incomeProfile === 'low' ? 'Low' : split.incomeProfile === 'medium' ? 'Medium' : 'High'}`)}
            </span>
            <span className={`${styles.badge} ${split.pressureLevel === 'critical' ? styles.badgeCritical : split.pressureLevel === 'high' ? styles.badgeLow : split.pressureLevel === 'moderate' ? styles.badgeMedium : styles.badgeHigh}`}>
              {t(`b.pressure${split.pressureLevel === 'critical' ? 'Critical' : split.pressureLevel === 'high' ? 'High' : split.pressureLevel === 'moderate' ? 'Moderate' : 'Low'}`)}
            </span>
          </div>

          {split.resteAVivre > 0 && (
            <div className={styles.rav}>
              <div className={styles.ravValue}>{fmt(Math.round(split.resteAVivre))}</div>
              <div className={styles.ravLabel}>{t('s.ravLabel')}</div>
            </div>
          )}

          {split.reasoning.length > 0 && (
            <div className={styles.insights}>
              <div className={styles.insightsTitle}>{t('s.smartAnalysis')}</div>
              {split.reasoning.map((r, i) => (
                <div key={i} className={`${styles.insightItem} ${r.startsWith('\u26A0') ? styles.insightWarn : ''}`}>
                  <Lightbulb size={13} />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Split editor */}
      <div className={styles.card}>
        <div className={styles.cardTitle}><Wallet size={15} /> {t('s.splitTitle')}</div>
        <div className={styles.cardDesc}>{t('s.splitDesc')}</div>
        <div className={styles.form}>
          {totalIncome > 0 && (
            <button type="button" className={styles.btnSecondary} onClick={applySmartSplit}>
              <RefreshCw size={13} /> {t('s.smartSplitBtn', { split: `${split.needs}/${split.wants}/${split.savings}` })}
            </button>
          )}

          <div className={styles.row3}>
            <div className={styles.field}>
              <label>{t('s.needsPct')}</label>
              <input type="number" value={needsPercent} onChange={(e) => setNeedsPercent(parseInt(e.target.value) || 0)} min={0} max={100} />
            </div>
            <div className={styles.field}>
              <label>{t('s.wantsPct')}</label>
              <input type="number" value={wantsPercent} onChange={(e) => setWantsPercent(parseInt(e.target.value) || 0)} min={0} max={100} />
            </div>
            <div className={styles.field}>
              <label>{t('s.savingsPct')}</label>
              <input type="number" value={savingsPercent} onChange={(e) => setSavingsPercent(parseInt(e.target.value) || 0)} min={0} max={100} />
            </div>
          </div>

          <div className={styles.splitPreview}>
            <div className={styles.splitBox}>
              <div className={`${styles.splitValue} ${styles.needsVal}`}>{needsPercent}%</div>
              <div className={styles.splitLabel}>{t('d.needs')}</div>
              {totalIncome > 0 && <div className={`${styles.splitAmount} ${styles.needsVal}`}>{fmt(Math.round(totalIncome * needsPercent / 100))}</div>}
            </div>
            <div className={styles.splitBox}>
              <div className={`${styles.splitValue} ${styles.wantsVal}`}>{wantsPercent}%</div>
              <div className={styles.splitLabel}>{t('d.wants')}</div>
              {totalIncome > 0 && <div className={`${styles.splitAmount} ${styles.wantsVal}`}>{fmt(Math.round(totalIncome * wantsPercent / 100))}</div>}
            </div>
            <div className={styles.splitBox}>
              <div className={`${styles.splitValue} ${styles.savingsVal}`}>{savingsPercent}%</div>
              <div className={styles.splitLabel}>{t('d.savings')}</div>
              {totalIncome > 0 && <div className={`${styles.splitAmount} ${styles.savingsVal}`}>{fmt(Math.round(totalIncome * savingsPercent / 100))}</div>}
            </div>
          </div>

          {(needsPercent + wantsPercent + savingsPercent) !== 100 && (
            <div className={`${styles.insightItem} ${styles.insightDanger}`}>
              <AlertTriangle size={13} />
              <span>{t('s.sumError', { n: needsPercent + wantsPercent + savingsPercent })}</span>
            </div>
          )}

          <div className={styles.btnRow}>
            <button className={styles.btnPrimary} onClick={handleSaveBudget} disabled={saving}>
              {saving ? t('s.saving') : t('s.save')}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const renderCategories = () => (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t('s.navCategories')}</h2>
        <p className={styles.sectionDesc}>{t('s.catDesc')}</p>
      </div>

      {(['needs', 'wants', 'savings'] as const).map((pillar) => {
        const pillarCats = categories.filter(c => c.pillar === pillar);
        if (pillarCats.length === 0) return null;
        return (
          <div key={pillar} className={styles.card}>
            <div className={styles.cardTitle}>{t(PILLAR_KEYS[pillar])} ({pillarCats.length})</div>
            <div className={styles.catList}>
              {pillarCats.map(cat => (
                <div key={cat.id} className={styles.catRow}>
                  <div className={styles.catIcon}>{iconToEmoji(cat.icon)}</div>
                  <div className={styles.catInfo}>
                    <div className={styles.catName}>{cat.name}</div>
                    <div className={styles.catPillar}>{t(PILLAR_KEYS[cat.pillar])}</div>
                  </div>
                  {cat.isDefault && <span className={styles.catDefault}>{t('s.catDefault')}</span>}
                  {!cat.isDefault && (
                    <button className={styles.catDeleteBtn} onClick={() => handleDeleteCategory(cat.id, cat.name)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className={styles.card}>
        <div className={styles.cardTitle}><Plus size={15} /> {t('s.addCat')}</div>
        <div className={styles.cardDesc}>{t('s.addCatDesc')}</div>
        <div className={styles.addRow}>
          <div className={styles.field}>
            <label>{t('s.catName')}</label>
            <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder={t('s.catNamePlaceholder')} />
          </div>
          <div className={styles.field}>
            <label>{t('s.catPillar')}</label>
            <select value={newCatPillar} onChange={(e) => setNewCatPillar(e.target.value)}>
              <option value="needs">{t('d.needs')}</option>
              <option value="wants">{t('d.wants')}</option>
              <option value="savings">{t('d.savings')}</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>{t('s.catIcon')}</label>
            <select value={newCatIcon} onChange={(e) => setNewCatIcon(e.target.value)}>
              {([
                ['circle', 's.iconDivers'], ['home', 's.iconHome'], ['shopping-cart', 's.iconGroceries'], ['car', 's.iconTransport'],
                ['shield', 's.iconInsurance'], ['heart-pulse', 's.iconHealth'], ['zap', 's.iconEnergy'], ['droplets', 's.iconWater'],
                ['wifi', 's.iconInternet'], ['phone', 's.iconPhone'], ['utensils', 's.iconDining'], ['shirt', 's.iconClothing'],
                ['graduation-cap', 's.iconEducation'], ['utensils-crossed', 's.iconCooking'], ['ticket', 's.iconLeisure'],
                ['shopping-bag', 's.iconShopping'], ['tv', 's.iconMultimedia'], ['gamepad-2', 's.iconGaming'],
                ['plane', 's.iconTravel'], ['gift', 's.iconGifts'], ['dumbbell', 's.iconSport'], ['sparkles', 's.iconWellness'],
                ['piggy-bank', 's.iconSavings'], ['trending-up', 's.iconInvestment'],
              ] as [string, string][]).map(([ic, key]) => (
                <option key={ic} value={ic}>{iconToEmoji(ic)} {t(key)}</option>
              ))}
            </select>
          </div>
          <button className={styles.btnPrimary} onClick={handleAddCategory} style={{ flexShrink: 0 }}>
            <Plus size={14} /> {t('s.addBtn')}
          </button>
        </div>
      </div>
    </>
  );

  const renderSecurity = () => {
    const secLevel = securityScore >= 3 ? 'high' : securityScore >= 2 ? 'medium' : 'low';
    const secPercent = Math.round((securityScore / 4) * 100);

    return (
      <>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('s.navSecurity')}</h2>
          <p className={styles.sectionDesc}>{t('s.secDesc')}</p>
        </div>

        <div className={styles.securityScore}>
          <div className={styles.securityLevel}>
            {secLevel === 'high' ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          </div>
          <div className={styles.securityMeter}>
            <div className={`${styles.securityMeterFill} ${secLevel === 'high' ? styles.securityMeterHigh : secLevel === 'medium' ? styles.securityMeterMedium : styles.securityMeterLow}`} style={{ width: `${secPercent}%` }} />
          </div>
          <div className={styles.securityLabel}>
            {secLevel === 'high' ? t('s.secHigh') : secLevel === 'medium' ? t('s.secMedium') : t('s.secLow')}
          </div>
        </div>

        {/* 2FA */}
        <div className={styles.card}>
          <div className={styles.cardTitle}><Smartphone size={15} /> {t('s.twoFA')}</div>
          <div className={styles.cardDesc}>
            {user.totpEnabled
              ? t('s.twoFAOn')
              : t('s.twoFAOff')}
          </div>
          {!user.totpEnabled && twoFAStep === 'idle' && (
            <div className={styles.btnRow}>
              <button className={styles.btnSecondary} onClick={handleSetup2FA}>
                <Lock size={13} /> {t('s.enable2FA')}
              </button>
            </div>
          )}
          {twoFAStep === 'setup' && <p style={{ fontSize: 13, color: '#9d9baf' }}>{t('s.loading')}</p>}
          {twoFAStep === 'verify' && qrCode && (
            <div className={styles.form}>
              <div className={styles.qrWrap}>
                <img src={qrCode} alt="QR Code 2FA" width={180} height={180} />
              </div>
              <p style={{ fontSize: 12, color: '#9d9baf', textAlign: 'center' }}>{t('s.scanQR')}</p>
              <div className={styles.totpCode}>
                <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} />
                <button className={styles.btnPrimary} onClick={handleEnable2FA}>
                  <Check size={14} /> {t('s.verify')}
                </button>
              </div>
            </div>
          )}
          {user.totpEnabled && (
            <div className={styles.btnRow}>
              <span className={`${styles.badge} ${styles.badgeHigh}`}><Check size={10} /> {t('s.active')}</span>
              <button className={styles.btnDanger} onClick={handleDisable2FA} style={{ marginLeft: 'auto' }}>
                {t('s.disable')}
              </button>
            </div>
          )}
        </div>

        {!user.totpEnabled && (
          <div className={`${styles.insightItem} ${styles.insightWarn}`} style={{ marginBottom: 20 }}>
            <AlertTriangle size={13} />
            <span>{t('s.recommend2FA')}</span>
          </div>
        )}

        {/* Sessions */}
        <div className={styles.card}>
          <div className={styles.cardTitle}><LogOut size={15} /> {t('s.sessions')}</div>
          <div className={styles.cardDesc}>{t('s.sessionsDesc')}</div>
          <div className={styles.btnRow}>
            <button className={styles.btnGhost} onClick={handleLogoutAll}>
              <LogOut size={13} /> {t('s.logoutAll')}
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderNotifications = () => (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t('s.navNotifications')}</h2>
        <p className={styles.sectionDesc}>{t('s.notifDesc')}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><Bell size={15} /> {t('s.alertsActive')}</div>
        <div className={styles.cardDesc}>{t('s.alertsActiveDesc')}</div>
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <div className={styles.settingLabel}>{t('s.alertOverspend')}</div>
            <div className={styles.settingHint}>{t('s.alertOverspendHint', { pct: tolerancePercent })}</div>
          </div>
          <div className={styles.settingAction}>
            <span className={`${styles.badge} ${styles.badgeHigh}`}><Check size={10} /> {t('s.active')}</span>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <div className={styles.settingLabel}>{t('s.alertGoalReached')}</div>
            <div className={styles.settingHint}>{t('s.alertGoalReachedHint')}</div>
          </div>
          <div className={styles.settingAction}>
            <span className={`${styles.badge} ${styles.badgeHigh}`}><Check size={10} /> {t('s.active')}</span>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <div className={styles.settingLabel}>{t('s.alertProjection')}</div>
            <div className={styles.settingHint}>{t('s.alertProjectionHint')}</div>
          </div>
          <div className={styles.settingAction}>
            <span className={`${styles.badge} ${styles.badgeHigh}`}><Check size={10} /> {t('s.active')}</span>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <div className={styles.settingLabel}>{t('s.alertPressure')}</div>
            <div className={styles.settingHint}>{t('s.alertPressureHint')}</div>
          </div>
          <div className={styles.settingAction}>
            <span className={`${styles.badge} ${styles.badgeHigh}`}><Check size={10} /> {t('s.active')}</span>
          </div>
        </div>
      </div>

      <div className={`${styles.insightItem} ${styles.insightSuccess}`} style={{ marginTop: 0 }}>
        <Zap size={13} />
        <span>{t('s.allAlertsNote')}</span>
      </div>
    </>
  );

  const renderData = () => (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t('s.navData')}</h2>
        <p className={styles.sectionDesc}>{t('s.dataDesc')}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><Download size={15} /> {t('s.exportTitle')}</div>
        <div className={styles.cardDesc}>{t('s.exportDesc')}</div>
        <div className={styles.btnRow}>
          <button className={styles.btnSecondary} onClick={handleExportData}>
            <Download size={13} /> {t('s.exportBtn')}
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><Lock size={15} /> {t('s.encryptTitle')}</div>
        <div className={styles.cardDesc}>{t('s.encryptDesc')}</div>
        <div className={`${styles.insightItem} ${styles.insightSuccess}`}>
          <ShieldCheck size={13} />
          <span>{t('s.encryptActive')}</span>
        </div>
      </div>

      <div className={`${styles.card} ${styles.dangerCard}`}>
        <div className={styles.cardTitle} style={{ color: '#e74c4c' }}><Trash2 size={15} /> {t('s.deleteTitle')}</div>
        <div className={styles.cardDesc}>{t('s.deleteDesc')}</div>
        <div className={styles.btnRow}>
          <button className={styles.btnDanger} onClick={handleDeleteAccount}>
            <Trash2 size={13} /> {t('s.deleteBtn')}
          </button>
        </div>
      </div>
    </>
  );

  const renderAppearance = () => (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t('s.navAppearance')}</h2>
        <p className={styles.sectionDesc}>{t('s.appDesc')}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><Palette size={15} /> {t('s.themeTitle')}</div>
        <div className={styles.cardDesc}>{t('s.themeDesc')}</div>
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <div className={styles.settingLabel}>{t('s.darkMode')}</div>
            <div className={styles.settingHint}>{t('s.darkModeHint')}</div>
          </div>
          <div className={styles.settingAction}>
            <span className={`${styles.badge} ${styles.badgeHigh}`}><Check size={10} /> {t('s.active')}</span>
          </div>
        </div>
      </div>

      <div className={`${styles.insightItem} ${styles.insightSuccess}`} style={{ marginTop: 0 }}>
        <Lightbulb size={13} />
        <span>{t('s.themeFuture')}</span>
      </div>
    </>
  );

  const renderHelp = () => (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t('s.navHelp')}</h2>
        <p className={styles.sectionDesc}>{t('s.helpDesc')}</p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}><HelpCircle size={15} /> {t('s.about')}</div>
        <div className={styles.form}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>{t('s.appLabel')}</div>
              <div className={styles.settingHint}>CapBudget</div>
            </div>
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>{t('s.versionLabel')}</div>
              <div className={styles.settingHint}>1.0.0</div>
            </div>
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>{t('s.createdAt')}</div>
              <div className={styles.settingHint}>{new Date(user.createdAt).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>{t('s.navCategories')}</div>
              <div className={styles.settingHint}>{t('s.catCount', { total: categories.length, custom: categories.filter(c => !c.isDefault).length })}</div>
            </div>
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>{t('s.secLabel')}</div>
              <div className={styles.settingHint}>{user.totpEnabled ? t('s.twoFAActive') : t('s.twoFAInactive')} — {user.emailVerified ? t('s.emailVerified') : t('s.emailNotVerified')}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const RENDER_MAP: Record<Tab, () => React.ReactNode> = {
    profile: renderProfile,
    financial: renderFinancial,
    categories: renderCategories,
    security: renderSecurity,
    notifications: renderNotifications,
    data: renderData,
    appearance: renderAppearance,
    help: renderHelp,
  };

  return (
    <div className={styles.page}>
      {/* ── Sidebar Nav (desktop) ── */}
      <nav className={styles.nav}>
        <h1 className={styles.navTitle}>{t('s.title')}</h1>
        <div className={styles.navList}>
          {TAB_ORDER.map(id => (
            <button
              key={id}
              className={`${styles.navItem} ${tab === id ? styles.navItemActive : ''}`}
              onClick={() => setTab(id)}
            >
              {NAV_ICONS[id]}
              {t(NAV_KEYS[id])}
              {id === 'security' && !user.totpEnabled && (
                <span className={`${styles.navBadge} ${styles.navBadgeWarn}`}>!</span>
              )}
              {id === 'security' && user.totpEnabled && (
                <span className={`${styles.navBadge} ${styles.navBadgeOk}`}><Check size={9} /></span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Mobile Nav ── */}
      <div className={styles.mobileNav}>
        {TAB_ORDER.map(id => (
          <button
            key={id}
            className={`${styles.mobileNavItem} ${tab === id ? styles.mobileNavActive : ''}`}
            onClick={() => setTab(id)}
          >
            {t(NAV_KEYS[id])}
          </button>
        ))}
      </div>

      {/* ── Main Content ── */}
      <div className={styles.content}>
        {RENDER_MAP[tab]()}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />} {toast.message}
        </div>
      )}

      {/* ── Modal ── */}
      <Modal {...modalProps} />
    </div>
  );
}
