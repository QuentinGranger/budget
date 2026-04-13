'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Plus, X, Check, ChevronDown, CalendarDays } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { iconToEmoji } from '@/lib/icon-map';
import type { Pillar } from '@/lib/types';
import styles from './QuickExpense.module.scss';

const PILLAR_LABELS: Record<string, string> = { needs: 'd.needs', wants: 'd.wants', savings: 'd.savings' };
const PILLAR_STYLE: Record<string, string> = { needs: 'pillarNeeds', wants: 'pillarWants', savings: 'pillarSavings' };
const QUICK_AMOUNTS = [5, 10, 20, 50, 100];
const DISMISS_THRESHOLD = 120;

export default function QuickExpense() {
  const { state, dispatch, actions, snapshot } = useStore();
  const { t, dateLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; scrollTop: number } | null>(null);

  const categories = state.user?.categories || [];
  const selectedCat = categories.find(c => c.id === categoryId);
  const currency = state.user?.currency || 'EUR';
  const fmt = useMemo(() => (n: number) => n.toLocaleString(dateLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }), [dateLocale, currency]);

  // Impact preview
  const impact = useMemo(() => {
    if (!snapshot || !amount || !selectedCat) return null;
    const numAmount = parseFloat(amount);
    if (numAmount <= 0 || isNaN(numAmount)) return null;
    const p = selectedCat.pillar as Pillar;
    const pillar = snapshot.pillars[p];
    if (!pillar) return null;
    const newSpent = pillar.spent + numAmount;
    const newPercent = pillar.budgeted > 0 ? (newSpent / pillar.budgeted) * 100 : 0;
    const newRemaining = pillar.budgeted - newSpent;
    return { pillar: p, newPercent: Math.min(newPercent, 200), newRemaining, isOver: newPercent > 100, budgeted: pillar.budgeted };
  }, [snapshot, amount, selectedCat]);

  // Auto-select first category when opening
  const handleOpen = useCallback(() => {
    const first = categories[0];
    setCategoryId(first?.id || '');
    setAmount('');
    setDescription('');
    setDate(new Date().toISOString().slice(0, 10));
    setDragY(0);
    setOpen(true);
  }, [categories]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDragY(0);
  }, []);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [open]);

  // Focus amount input when sheet opens
  useEffect(() => {
    if (open && amountRef.current) {
      setTimeout(() => amountRef.current?.focus(), 300);
    }
  }, [open]);

  // ── Drag-to-dismiss ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    dragStart.current = { y: e.touches[0].clientY, scrollTop: el.scrollTop };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragStart.current) return;
    const el = sheetRef.current;
    if (!el) return;
    const dy = e.touches[0].clientY - dragStart.current.y;
    // Only allow downward drag when scrolled to top
    if (dragStart.current.scrollTop <= 0 && dy > 0) {
      e.preventDefault();
      setDragY(dy);
      setIsDragging(true);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > DISMISS_THRESHOLD) {
      handleClose();
    } else {
      setDragY(0);
    }
    setIsDragging(false);
    dragStart.current = null;
  }, [dragY, handleClose]);

  const addQuickAmount = useCallback((n: number) => {
    setAmount(prev => {
      const current = parseFloat(prev) || 0;
      return String(current + n);
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!categoryId || !amount || saving) return;
    const numAmount = parseFloat(amount);
    if (numAmount <= 0 || isNaN(numAmount)) return;

    setSaving(true);
    try {
      await actions.createTransaction(dispatch, {
        categoryId,
        amount: numAmount,
        date,
        description,
        note: '',
        pillar: selectedCat?.pillar || 'needs',
        isRecurring: false,
      });
      setOpen(false);
      setDragY(0);
      setToast(true);
      setTimeout(() => setToast(false), 2500);
    } catch (err) {
      console.error('Quick expense error:', err);
    }
    setSaving(false);
  }, [categoryId, amount, date, description, selectedCat, saving, actions, dispatch]);

  if (!state.user || categories.length === 0) return null;

  const sheetStyle = dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: isDragging ? 'none' : undefined } : undefined;
  const overlayOpacity = dragY > 0 ? Math.max(0, 1 - dragY / (DISMISS_THRESHOLD * 2)) : 1;

  return (
    <>
      {/* FAB */}
      <button
        className={`${styles.fab} ${open ? styles.fabOpen : ''}`}
        onClick={open ? handleClose : handleOpen}
        aria-label={t('qe.title')}
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className={styles.overlay}
          onClick={handleClose}
          style={overlayOpacity < 1 ? { opacity: overlayOpacity } : undefined}
        />
      )}

      {/* Bottom Sheet */}
      {open && (
        <div
          ref={sheetRef}
          className={styles.sheet}
          style={sheetStyle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag handle */}
          <div className={styles.dragHandle}>
            <div className={styles.dragBar} />
            <ChevronDown size={14} className={styles.dragHint} />
          </div>

          <div className={styles.sheetHeader}>
            <h3>{t('qe.title')}</h3>
            <button className={styles.closeBtn} onClick={handleClose}>
              <X size={16} />
            </button>
          </div>

          <div className={styles.form}>
            {/* Amount — prominent */}
            <div className={styles.amountSection}>
              <div className={styles.amountRow}>
                <input
                  ref={amountRef}
                  className={styles.amountInput}
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
                <span className={styles.amountCurrency}>{currency}</span>
              </div>
              <div className={styles.quickAmounts}>
                {QUICK_AMOUNTS.map(n => (
                  <button key={n} className={styles.quickAmountBtn} onClick={() => addQuickAmount(n)} type="button">
                    +{n}
                  </button>
                ))}
              </div>
            </div>

            {/* Category chips */}
            <div className={styles.label}>{t('qe.category')}</div>
            <div className={styles.categoryGrid}>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`${styles.categoryChip} ${categoryId === cat.id ? styles.categoryChipActive : ''}`}
                  onClick={() => setCategoryId(cat.id)}
                  type="button"
                >
                  <span className={styles.chipEmoji}>{iconToEmoji(cat.icon)}</span>
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Pillar indicator + impact */}
            {selectedCat && (
              <div className={`${styles.pillarRow} ${impact?.isOver ? styles.pillarOver : ''}`}>
                <div className={`${styles.pillarDot} ${styles[PILLAR_STYLE[selectedCat.pillar]] || ''}`} />
                <span>{t(PILLAR_LABELS[selectedCat.pillar] || 'd.needs')}</span>
                {impact && (
                  <span className={styles.pillarImpact}>
                    {Math.round(impact.newPercent)}% — {impact.newRemaining >= 0 ? `${fmt(impact.newRemaining)} ${t('tx.remaining')}` : `${fmt(Math.abs(impact.newRemaining))} ${t('d.xOver', { amount: '' }).trim()}`}
                  </span>
                )}
              </div>
            )}

            {/* Date + Description row */}
            <div className={styles.metaRow}>
              <div className={styles.dateField}>
                <CalendarDays size={14} className={styles.dateIcon} />
                <input
                  className={styles.dateInput}
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
              <input
                className={styles.descInput}
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('qe.description')}
              />
            </div>

            {/* Submit */}
            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={saving || !categoryId || !amount || parseFloat(amount) <= 0}
            >
              {saving ? (
                <span className={styles.spinner} />
              ) : (
                <>
                  <Check size={18} strokeWidth={2.5} />
                  {t('qe.add')} {amount && parseFloat(amount) > 0 ? fmt(parseFloat(amount)) : ''}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Success toast */}
      {toast && (
        <div className={styles.toast}>
          <Check size={14} />
          {t('qe.added')}
        </div>
      )}
    </>
  );
}
