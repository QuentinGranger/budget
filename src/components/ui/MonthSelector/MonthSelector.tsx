'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './MonthSelector.module.scss';

interface MonthSelectorProps {
  currentMonth: Date;
  onChange: (date: Date) => void;
}

export default function MonthSelector({ currentMonth, onChange }: MonthSelectorProps) {
  const prev = () => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() - 1);
    onChange(d);
  };

  const next = () => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() + 1);
    onChange(d);
  };

  const label = currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className={styles.wrapper}>
      <button className={styles.btn} onClick={prev}><ChevronLeft size={18} /></button>
      <span className={styles.label}>{label}</span>
      <button className={styles.btn} onClick={next}><ChevronRight size={18} /></button>
    </div>
  );
}
