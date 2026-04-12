'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import styles from '../login/login.module.scss';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.card}>Chargement...</div></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
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
      setError('Les mots de passe ne correspondent pas');
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
        setError(data.error || (data.details ? data.details.join(', ') : 'Erreur'));
      } else {
        setDone(true);
      }
    } catch {
      setError('Erreur reseau');
    }
    setLoading(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/blason.png" alt="" className={styles.blason} />
          <img src="/logo.png" alt="CapBudget" className={styles.logoText} />
          <p>Nouveau mot de passe</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {done ? (
          <>
            <div className={styles.error} style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
              Mot de passe reinitialise avec succes !
            </div>
            <div className={styles.links} style={{ marginTop: 16 }}>
              <Link href="/login">Se connecter</Link>
            </div>
          </>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label>Nouveau mot de passe</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <div className={styles.field}>
              <label>Confirmer</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Chargement...' : 'Reinitialiser'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
