'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import styles from '../login/login.module.scss';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.card}>...</div></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (data.details ? data.details.join(', ') : t('auth.error')));
      } else {
        setDone(true);
      }
    } catch {
      setError(t('auth.networkError'));
    }
    setLoading(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/blason.png" alt="" className={styles.blason} />
          <img src="/logo.png" alt="CapBudget" className={styles.logoText} />
          <p>{t('auth.newPasswordTitle')}</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {done ? (
          <>
            <div className={styles.error} style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
              {t('auth.resetSuccess')}
            </div>
            <div className={styles.links} style={{ marginTop: 16 }}>
              <Link href="/login">{t('auth.login')}</Link>
            </div>
          </>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label>{t('auth.newPassword')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <div className={styles.field}>
              <label>{t('auth.confirmPassword')}</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? t('auth.loading') : t('auth.reset')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
