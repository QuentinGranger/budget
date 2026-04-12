'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import styles from '../login/login.module.scss';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erreur');
      } else {
        setSent(true);
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
          <p>Reinitialisation du mot de passe</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {sent ? (
          <div className={styles.error} style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            Si un compte existe avec cet email, un lien de reinitialisation a ete envoye.
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="votre@email.com" required />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Envoi...' : 'Envoyer le lien'}
            </button>
          </form>
        )}

        <div className={styles.links}>
          <Link href="/login">Retour a la connexion</Link>
        </div>
      </div>
    </div>
  );
}
