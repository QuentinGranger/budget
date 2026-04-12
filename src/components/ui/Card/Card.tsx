import React from 'react';
import styles from './Card.module.scss';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className }: CardProps) {
  return <div className={`${styles.card} ${className || ''}`}>{children}</div>;
}

export function CardHeader({ children, className }: CardProps) {
  return <div className={`${styles.header} ${className || ''}`}>{children}</div>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className={styles.title}>{children}</h3>;
}

export function CardValue({ children }: { children: React.ReactNode }) {
  return <div className={styles.value}>{children}</div>;
}

export function CardSubtitle({ children }: { children: React.ReactNode }) {
  return <p className={styles.subtitle}>{children}</p>;
}
