'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import styles from '../login/login.module.scss';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.card}>Chargement...</div></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token manquant');
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
          setMessage(data.message || 'Email verifie avec succes !');
        } else {
          setStatus('error');
          setMessage(data.error || 'Erreur de verification');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Erreur reseau');
      });
  }, [token]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/blason.png" alt="" className={styles.blason} />
          <img src="/logo.png" alt="CapBudget" className={styles.logoText} />
          <p>Verification d&apos;email</p>
        </div>

        {status === 'loading' && <p style={{ textAlign: 'center', color: '#a0a0b8' }}>Verification en cours...</p>}

        {status === 'success' && (
          <div className={styles.error} style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            {message}
          </div>
        )}

        {status === 'error' && <div className={styles.error}>{message}</div>}

        <div className={styles.links} style={{ marginTop: 20 }}>
          <Link href="/login">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
