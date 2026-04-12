'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Search, X, Pencil, Trash2, Home, Wallet, CreditCard, TrendingUp, Repeat, ArrowUpDown, Zap, AlertTriangle, Hash, CalendarDays, Lock } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import PillarBadge from '@/components/ui/PillarBadge/PillarBadge';
import { iconToEmoji } from '@/lib/icon-map';
import type { Pillar } from '@/lib/types';
import Modal, { useConfirm } from '@/components/Modal/Modal';
import styles from './transactions.module.scss';

const PILLAR_KEYS: Record<Pillar, string> = { needs: 'd.needs', wants: 'd.wants', savings: 'd.savings' };


interface TxForm {
  id?: string;
  categoryId: string;
  amount: string;
  date: string;
  description: string;
  note: string;
  pillar: string;
  isRecurring: boolean;
}

const emptyForm: TxForm = {
  categoryId: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  note: '',
  pillar: 'needs',
  isRecurring: false,
};

export default function TransactionsPage() {
  const { state, dispatch, actions, snapshot, allTransactions } = useStore();
  const { t, dateLocale } = useI18n();
  const user = state.user;

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<TxForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterPillar, setFilterPillar] = useState<'all' | Pillar>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterRecurring, setFilterRecurring] = useState<'all' | 'recurring' | 'once'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const categories = user?.categories || [];
  const currency = user?.currency || 'EUR';
  const fmt = (n: number) => n.toLocaleString(dateLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const activeFilters = [filterPillar !== 'all', filterCategory !== 'all', filterRecurring !== 'all', search.length > 0].filter(Boolean).length;

  const isSynthetic = (id: string) => id.startsWith('__loyer__');

  // ── Filtered + sorted ──
  const filtered = useMemo(() => {
    let txs = [...allTransactions];
    if (search) {
      const q = search.toLowerCase();
      txs = txs.filter(tx =>
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.category?.name || '').toLowerCase().includes(q) ||
        (tx.note || '').toLowerCase().includes(q)
      );
    }
    if (filterPillar !== 'all') txs = txs.filter(tx => tx.pillar === filterPillar);
    if (filterCategory !== 'all') txs = txs.filter(tx => tx.categoryId === filterCategory);
    if (filterRecurring === 'recurring') txs = txs.filter(tx => tx.isRecurring);
    if (filterRecurring === 'once') txs = txs.filter(tx => !tx.isRecurring);
    txs.sort((a, b) => {
      if (sortBy === 'date') {
        const cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
        return sortDir === 'desc' ? -cmp : cmp;
      }
      return sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount;
    });
    return txs;
  }, [allTransactions, search, filterPillar, filterCategory, filterRecurring, sortBy, sortDir]);

  // ── Group by day ──
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const tx of filtered) {
      const key = new Date(tx.date).toISOString().slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    }
    return Array.from(groups.entries()).sort((a, b) =>
      sortDir === 'desc' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])
    );
  }, [filtered, sortDir]);

  // ── Period KPIs ──
  const kpis = useMemo(() => {
    const total = filtered.reduce((s, t) => s + t.amount, 0);
    const count = filtered.length;
    const catMap = new Map<string, number>();
    for (const tx of filtered) {
      const name = tx.category?.name || t('tx.other');
      catMap.set(name, (catMap.get(name) || 0) + tx.amount);
    }
    const topCat = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const recurringTotal = filtered.filter(t => t.isRecurring).reduce((s, t) => s + t.amount, 0);
    return { total, count, topCat, recurringTotal };
  }, [filtered]);

  // ── Smart insights ──
  const insights = useMemo(() => {
    const msgs: { id: string; message: string; tone: 'info' | 'caution' | 'positive' }[] = [];
    if (!snapshot) return msgs;
    for (const p of ['needs', 'wants'] as Pillar[]) {
      const pu = snapshot.pillars[p].percentUsed;
      if (pu > 90 && pu <= 100) {
        msgs.push({ id: `limit-${p}`, message: t('tx.insightLimit', { pillar: t(PILLAR_KEYS[p]), pct: Math.round(pu), remaining: fmt(snapshot.pillars[p].remaining) }), tone: 'caution' });
      } else if (pu > 100) {
        msgs.push({ id: `over-${p}`, message: t('tx.insightOver', { pillar: t(PILLAR_KEYS[p]), amount: fmt(snapshot.pillars[p].spent - snapshot.pillars[p].budgeted) }), tone: 'caution' });
      }
    }
    if (snapshot.pillars.savings.spent >= snapshot.pillars.savings.budgeted && snapshot.pillars.savings.budgeted > 0) {
      msgs.push({ id: 'savings-done', message: t('tx.insightSavings'), tone: 'positive' });
    }
    const recurringCount = state.transactions.filter(tx => tx.isRecurring).length;
    if (recurringCount > 0) {
      const recTotal = state.transactions.filter(tx => tx.isRecurring).reduce((s, tx) => s + tx.amount, 0);
      msgs.push({ id: 'recurring', message: t('tx.insightRecurring', { count: recurringCount, s: recurringCount > 1 ? 's' : '', amount: fmt(recTotal) }), tone: 'info' });
    }
    return msgs;
  }, [snapshot, state.transactions, currency]);

  // ── Impact preview ──
  const impact = useMemo(() => {
    if (!snapshot || !form.amount) return null;
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) return null;
    const p = form.pillar as Pillar;
    const pillar = snapshot.pillars[p];
    if (!pillar) return null;
    const currentAmount = form.id ? (state.transactions.find(t => t.id === form.id)?.amount || 0) : 0;
    const newSpent = pillar.spent - currentAmount + amount;
    const newPercent = pillar.budgeted > 0 ? (newSpent / pillar.budgeted) * 100 : 0;
    const newRemaining = pillar.budgeted - newSpent;
    return { pillar: p, newPercent: Math.min(newPercent, 200), newRemaining, isOver: newPercent > 100 };
  }, [snapshot, form.amount, form.pillar, form.id, state.transactions]);

  // ── Handlers ──
  const openNew = () => {
    const firstCat = categories[0];
    setForm({ ...emptyForm, categoryId: firstCat?.id || '', pillar: firstCat?.pillar || 'needs' });
    setShowModal(true);
  };

  const openEdit = (tx: typeof state.transactions[0]) => {
    setForm({
      id: tx.id,
      categoryId: tx.categoryId,
      amount: String(tx.amount),
      date: new Date(tx.date).toISOString().slice(0, 10),
      description: tx.description,
      note: tx.note,
      pillar: tx.pillar,
      isRecurring: tx.isRecurring,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        categoryId: form.categoryId,
        amount: parseFloat(form.amount),
        date: form.date,
        description: form.description,
        note: form.note,
        pillar: form.pillar,
        isRecurring: form.isRecurring,
      };
      if (form.id) {
        await actions.updateTransaction(dispatch, { id: form.id, ...data } as never);
      } else {
        await actions.createTransaction(dispatch, data as never);
      }
      setShowModal(false);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const { confirm, modalProps } = useConfirm();

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t('tx.deleteTitle'),
      message: t('tx.deleteMessage'),
      confirmLabel: t('tx.delete'),
      variant: 'danger',
    });
    if (!ok) return;
    await actions.deleteTransaction(dispatch, id);
  };

  const handleCategoryChange = (categoryId: string) => {
    const cat = categories.find(c => c.id === categoryId);
    setForm({ ...form, categoryId, pillar: cat?.pillar || form.pillar });
  };

  const clearFilters = () => {
    setSearch('');
    setFilterPillar('all');
    setFilterCategory('all');
    setFilterRecurring('all');
  };

  const toggleSort = (by: 'date' | 'amount') => {
    if (sortBy === by) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(by); setSortDir('desc'); }
  };

  const formatDayHeader = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // ── Unique categories for filter ──
  const usedCategories = useMemo(() => {
    const ids = new Set(allTransactions.map(t => t.categoryId));
    return categories.filter(c => ids.has(c.id));
  }, [allTransactions, categories]);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <h1>{t('tx.title')}</h1>
        <button className={styles.addBtn} onClick={openNew}>
          <Plus size={16} /> {t('tx.add')}
        </button>
      </div>

      {/* ── Context Strip ── */}
      {snapshot && (
        <div className={styles.contextStrip}>
          <div className={styles.contextItem}>
            <Wallet size={13} className={styles.contextIcon} />
            <span className={styles.contextLabel}>{t('tx.income')}</span>
            <span className={styles.contextValue}>{fmt(snapshot.totalIncome)}</span>
          </div>
          <div className={styles.contextDivider} />
          {snapshot.monthlyFixedExpenses > 0 && (
            <>
              <div className={styles.contextItem}>
                <Home size={13} className={styles.contextIcon} />
                <span className={styles.contextLabel}>{t('tx.rent')}</span>
                <span className={styles.contextValue}>{fmt(snapshot.monthlyFixedExpenses)}</span>
              </div>
              <div className={styles.contextDivider} />
            </>
          )}
          <div className={styles.contextItem}>
            <CreditCard size={13} className={styles.contextIcon} />
            <span className={styles.contextLabel}>{t('tx.spent')}</span>
            <span className={styles.contextValue}>{fmt(snapshot.totalSpent)}</span>
          </div>
          <div className={styles.contextDivider} />
          <div className={styles.contextItem}>
            <span className={styles.contextLabel}>{t('tx.available')}</span>
            <span className={`${styles.contextValue} ${snapshot.totalRemaining >= 0 ? styles.ctxPositive : styles.ctxNegative}`}>
              {fmt(snapshot.totalRemaining)}
            </span>
          </div>
        </div>
      )}

      {/* ── Toolbar: Search + Filters ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder={t('tx.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>

        <div className={styles.filters}>
          {(['needs', 'wants', 'savings'] as Pillar[]).map(p => (
            <button
              key={p}
              className={`${styles.filterChip} ${filterPillar === p ? styles.filterChipActive : ''}`}
              onClick={() => setFilterPillar(filterPillar === p ? 'all' : p)}
            >
              {t(PILLAR_KEYS[p])}
            </button>
          ))}

          {usedCategories.length > 3 && (
            <select
              className={styles.filterChip}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{ appearance: 'auto' }}
            >
              <option value="all">{t('tx.category')}</option>
              {usedCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <button
            className={`${styles.filterChip} ${filterRecurring === 'recurring' ? styles.filterChipActive : ''}`}
            onClick={() => setFilterRecurring(filterRecurring === 'recurring' ? 'all' : 'recurring')}
          >
            <Repeat size={11} /> {t('tx.recurring')}
          </button>

          <button
            className={`${styles.sortBtn} ${sortBy === 'amount' ? styles.sortActive : ''}`}
            onClick={() => toggleSort(sortBy === 'amount' ? 'date' : 'amount')}
          >
            <ArrowUpDown size={11} />
            {sortBy === 'date' ? t('tx.date') : t('tx.amount')}
          </button>

          {activeFilters > 0 && (
            <button className={styles.clearFilters} onClick={clearFilters}>
              <X size={11} /> {t('tx.clearFilters', { n: activeFilters })}
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Summary ── */}
      {state.transactions.length > 0 && (
        <div className={styles.kpiStrip}>
          <div className={styles.kpiItem}>
            <div className={styles.kpiValue}>{fmt(kpis.total)}</div>
            <div className={styles.kpiLabel}>{activeFilters > 0 ? t('tx.totalFiltered') : t('tx.totalAll')}</div>
          </div>
          <div className={styles.kpiItem}>
            <div className={styles.kpiValue}>{kpis.count}</div>
            <div className={styles.kpiLabel}>{t('tx.transactions')}</div>
          </div>
          <div className={styles.kpiItem}>
            <div className={styles.kpiValue}>{kpis.topCat ? kpis.topCat[0] : '-'}</div>
            <div className={styles.kpiLabel}>{kpis.topCat ? fmt(kpis.topCat[1]) : t('tx.topCategory')}</div>
          </div>
          <div className={styles.kpiItem}>
            <div className={styles.kpiValue}>
              {snapshot && snapshot.daysElapsed > 0 ? fmt(kpis.total / snapshot.daysElapsed) : '-'}
            </div>
            <div className={styles.kpiLabel}>{t('tx.avgDay')}</div>
          </div>
        </div>
      )}

      {/* ── Smart Insights ── */}
      {insights.length > 0 && (
        <div className={styles.insightsStrip}>
          {insights.map(ins => (
            <div key={ins.id} className={`${styles.insightChip} ${
              ins.tone === 'caution' ? styles.insightCaution :
              ins.tone === 'positive' ? styles.insightPositive : styles.insightInfo
            }`}>
              {ins.tone === 'caution' ? <AlertTriangle size={13} /> :
               ins.tone === 'positive' ? <TrendingUp size={13} /> : <Zap size={13} />}
              {ins.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Transaction List ── */}
      {allTransactions.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><CalendarDays size={48} /></div>
          <div className={styles.emptyTitle}>{t('tx.emptyTitle')}</div>
          <div className={styles.emptyText}>
            {t('tx.emptyText')}
          </div>
          <button className={styles.emptyAction} onClick={openNew}>
            <Plus size={16} /> {t('tx.addTransaction')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.noResults}>
          <Hash size={16} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>{t('tx.noResults')}</div>
        </div>
      ) : (
        grouped.map(([dateStr, txs]) => {
          const dayTotal = txs.reduce((s, t) => s + t.amount, 0);
          return (
            <div key={dateStr} className={styles.dayGroup}>
              <div className={styles.dayHeader}>
                <span className={styles.dayDate}>{formatDayHeader(dateStr)}</span>
                <span className={styles.dayTotal}>{fmt(dayTotal)}</span>
              </div>
              {txs.map(tx => (
                <div key={tx.id} className={`${styles.txRow} ${isSynthetic(tx.id) ? styles.txSynthetic : ''}`} onClick={() => !isSynthetic(tx.id) && openEdit(tx)}>
                  <div className={styles.txIcon}>
                    {iconToEmoji(tx.category?.icon || '')}
                  </div>
                  <div className={styles.txMain}>
                    <div className={styles.txDesc}>
                      {tx.description || tx.category?.name || t('tx.transaction')}
                      {isSynthetic(tx.id) && <Lock size={11} className={styles.lockIcon} />}
                    </div>
                    <div className={styles.txCategory}>{tx.category?.name || '-'}</div>
                  </div>
                  <div className={styles.txPillar}>
                    <PillarBadge pillar={tx.pillar as Pillar} />
                  </div>
                  <div className={styles.txMeta}>
                    {tx.isRecurring && <span className={styles.txRecurring}>{t('tx.recurringBadge')}</span>}
                  </div>
                  <div className={styles.txAmount}>{fmt(tx.amount)}</div>
                  <div className={styles.txActions}>
                    {isSynthetic(tx.id) ? (
                      <span className={styles.syntheticLabel}>{t('tx.auto')}</span>
                    ) : (
                      <>
                        <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); openEdit(tx); }}>
                          <Pencil size={13} />
                        </button>
                        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={(e) => handleDelete(tx.id, e)}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? t('tx.editTitle') : t('tx.newTitle')}</h2>
            <div className={styles.form}>
              <div className={styles.field}>
                <label>{t('tx.category')}</label>
                <select value={form.categoryId} onChange={(e) => handleCategoryChange(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{iconToEmoji(c.icon)} {c.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>{t('tx.amount')}</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div className={styles.field}>
                  <label>{t('tx.date')}</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label>{t('tx.description')}</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t('tx.descPlaceholder')}
                />
              </div>

              <div className={styles.field}>
                <label>{t('tx.note')}</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder={t('tx.notePlaceholder')}
                />
              </div>

              <label className={styles.recurringToggle}>
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                />
                <span>{t('tx.recurringLabel')}</span>
              </label>

              {/* ── Impact Preview ── */}
              {impact && (
                <div className={`${styles.impactPreview} ${impact.isOver ? styles.impactOver : styles.impactOk}`}>
                  <div className={styles.impactHeader}>{t('tx.impactOn', { pillar: t(PILLAR_KEYS[impact.pillar]) })}</div>
                  <div className={styles.impactRow}>
                    <span className={styles.impactLabel}>{t('tx.usageAfter')}</span>
                    <span className={`${styles.impactValue} ${impact.isOver ? styles.impactBad : styles.impactGood}`}>
                      {Math.round(impact.newPercent)}%
                    </span>
                  </div>
                  <div className={styles.impactRow}>
                    <span className={styles.impactLabel}>{t('tx.remaining')}</span>
                    <span className={`${styles.impactValue} ${impact.newRemaining < 0 ? styles.impactBad : styles.impactGood}`}>
                      {fmt(impact.newRemaining)}
                    </span>
                  </div>
                  <div className={styles.impactBar}>
                    <div
                      className={`${styles.impactBarFill} ${
                        impact.pillar === 'needs' ? styles.impactBarNeeds :
                        impact.pillar === 'wants' ? styles.impactBarWants : styles.impactBarSavings
                      }`}
                      style={{ width: `${Math.min(impact.newPercent, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>{t('tx.cancel')}</button>
                <button
                  className={styles.saveBtn}
                  onClick={handleSave}
                  disabled={saving || !form.categoryId || !form.amount}
                >
                  {saving ? t('tx.saving') : t('tx.save')}
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
