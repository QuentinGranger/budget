'use client';

import React, { useEffect, useCallback } from 'react';
import { AlertTriangle, Trash2, ShieldAlert, LogOut, Info } from 'lucide-react';
import styles from './Modal.module.scss';

export type ModalVariant = 'default' | 'danger' | 'warn';

export interface ModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ModalVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

const ICONS: Record<ModalVariant, React.ReactNode> = {
  default: <Info size={18} />,
  warn: <ShieldAlert size={18} />,
  danger: <Trash2 size={18} />,
};

export default function Modal({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'default',
  onConfirm,
  onCancel,
}: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={`${styles.modal} ${variant === 'danger' ? styles.modalDanger : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.header}>
          <div className={`${styles.iconWrap} ${variant === 'danger' ? styles.iconDanger : variant === 'warn' ? styles.iconWarn : ''}`}>
            {variant === 'warn' ? <AlertTriangle size={18} /> : ICONS[variant]}
          </div>
          <div className={styles.headerText}>
            <h3 className={styles.title}>{title}</h3>
          </div>
        </div>
        <div className={styles.body}>
          <p className={styles.message}>{message}</p>
        </div>
        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`${styles.btnConfirm} ${variant === 'danger' ? styles.btnDanger : ''}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hook for easy confirm dialog usage ──
interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: ModalVariant;
  resolve: ((value: boolean) => void) | null;
}

export function useConfirm() {
  const [state, setState] = React.useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmer',
    variant: 'default',
    resolve: null,
  });

  const confirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; variant?: ModalVariant }): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          open: true,
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel || 'Confirmer',
          variant: opts.variant || 'default',
          resolve,
        });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state.resolve]);

  const modalProps: ModalProps = {
    open: state.open,
    title: state.title,
    message: state.message,
    confirmLabel: state.confirmLabel,
    variant: state.variant,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { confirm, modalProps };
}
