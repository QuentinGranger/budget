import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import styles from './AlertCard.module.scss';

interface AlertCardProps {
  type: 'warning' | 'danger' | 'info' | 'success';
  message: string;
}

const ICONS = {
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
  success: CheckCircle,
};

export default function AlertCard({ type, message }: AlertCardProps) {
  const Icon = ICONS[type];
  return (
    <div className={`${styles.alert} ${styles[type]}`}>
      <Icon size={18} className={styles.icon} />
      <span className={styles.message}>{message}</span>
    </div>
  );
}
