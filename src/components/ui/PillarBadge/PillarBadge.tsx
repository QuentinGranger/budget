import React from 'react';
import styles from './PillarBadge.module.scss';

interface PillarBadgeProps {
  pillar: 'needs' | 'wants' | 'savings';
}

const LABELS: Record<string, string> = {
  needs: 'Besoins',
  wants: 'Envies',
  savings: 'Epargne',
};

export default function PillarBadge({ pillar }: PillarBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[pillar]}`}>
      {LABELS[pillar] || pillar}
    </span>
  );
}
