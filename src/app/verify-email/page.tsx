'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import styles from '../login/login.module.scss';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.card}>...</div></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('auth.tokenMissing'));
      return;
    }

    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || t('auth.verifySuccess'));
        } else {
          setStatus('error');
          setMessage(data.error || t('auth.verifyError'));
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage(t('auth.networkError'));
      });
  }, [token]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/blason.png" alt="" className={styles.blason} />
          <img src="/logo.png" alt="CapBudget" className={styles.logoText} />
          <p>{t('auth.verifyTitle')}</p>
        </div>

        {status === 'loading' && <p style={{ textAlign: 'center', color: '#a0a0b8' }}>{t('auth.verifying')}</p>}

        {status === 'success' && (
          <div className={styles.error} style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            {message}
          </div>
        )}

        {status === 'error' && <div className={styles.error}>{message}</div>}

        <div className={styles.links} style={{ marginTop: 20 }}>
          <Link href="/login">{t('auth.login')}</Link>
        </div>
      </div>
    </div>
  );
}
