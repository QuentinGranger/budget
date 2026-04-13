'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { iconToEmoji } from '@/lib/icon-map';
import styles from './QuickExpense.module.scss';

const PILLAR_LABELS: Record<string, string> = { needs: 'd.needs', wants: 'd.wants', savings: 'd.savings' };
const PILLAR_STYLE: Record<string, string> = { needs: 'pillarNeeds', wants: 'pillarWants', savings: 'pillarSavings' };

export default function QuickExpense() {
  const { state, dispatch, actions } = useStore();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const categories = state.user?.categories || [];
  const selectedCat = categories.find(c => c.id === categoryId);

  // Auto-select first category when opening
  const handleOpen = useCallback(() => {
    const first = categories[0];
    setCategoryId(first?.id || '');
    setAmount('');
    setDescription('');
    setOpen(true);
  }, [categories]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  // Focus amount input when sheet opens
  useEffect(() => {
    if (open && amountRef.current) {
      setTimeout(() => amountRef.current?.focus(), 300);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!categoryId || !amount || saving) return;
    const numAmount = parseFloat(amount);
    if (numAmount <= 0 || isNaN(numAmount)) return;

    setSaving(true);
    try {
      await actions.createTransaction(dispatch, {
        categoryId,
        amount: numAmount,
        date: new Date().toISOString().slice(0, 10),
        description,
        note: '',
        pillar: selectedCat?.pillar || 'needs',
        isRecurring: false,
      });
      setOpen(false);
      setToast(true);
      setTimeout(() => setToast(false), 2000);
    } catch (err) {
      console.error('Quick expense error:', err);
    }
    setSaving(false);
  }, [categoryId, amount, description, selectedCat, saving, actions, dispatch]);

  // Don't render if no user/categories
  if (!state.user || categories.length === 0) return null;

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
      {open && <div className={styles.overlay} onClick={handleClose} />}

      {/* Bottom Sheet */}
      {open && (
        <div className={styles.sheet}>
          <div className={styles.sheetHeader}>
            <h3>{t('qe.title')}</h3>
            <button className={styles.closeBtn} onClick={handleClose}>
              <X size={16} />
            </button>
          </div>

          <div className={styles.form}>
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

            {/* Pillar indicator */}
            {selectedCat && (
              <div className={styles.pillarRow}>
                <div className={`${styles.pillarDot} ${styles[PILLAR_STYLE[selectedCat.pillar]] || ''}`} />
                {t(PILLAR_LABELS[selectedCat.pillar] || 'd.needs')}
              </div>
            )}

            {/* Amount */}
            <div className={styles.label}>{t('qe.amount')}</div>
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
            </div>

            {/* Description */}
            <input
              className={styles.descInput}
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('qe.description')}
            />

            {/* Submit */}
            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={saving || !categoryId || !amount || parseFloat(amount) <= 0}
            >
              {saving ? t('qe.adding') : (
                <>
                  <Check size={16} />
                  {t('qe.add')}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Success toast */}
      {toast && (
        <div className={styles.toast}>
          <Check size={14} style={{ marginRight: 6 }} />
          {t('qe.added')}
        </div>
      )}
    </>
  );
}
