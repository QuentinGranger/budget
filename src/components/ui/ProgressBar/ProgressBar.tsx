import React from 'react';
import styles from './ProgressBar.module.scss';

interface ProgressBarProps {
  percent: number;
  variant?: 'needs' | 'wants' | 'savings' | 'gold' | 'danger';
  label?: string;
  valueLabel?: string;
}

export default function ProgressBar({ percent, variant = 'gold', label, valueLabel }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const colorClass = clamped > 100 ? styles.danger : styles[variant];

  return (
    <div className={styles.wrapper}>
      {(label || valueLabel) && (
        <div className={styles.label}>
          <span>{label}</span>
          <span>{valueLabel || `${Math.round(percent)}%`}</span>
        </div>
      )}
      <div className={styles.track}>
        <div className={`${styles.fill} ${colorClass}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
