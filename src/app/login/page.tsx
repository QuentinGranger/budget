'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import styles from './login.module.scss';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password, totpCode: totpCode || undefined }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setError(t('auth.serverError', { status: res.status }));
        setLoading(false);
        return;
      }

      if (!res.ok) {
        if (data.requires2FA) {
          setNeeds2FA(true);
          setLoading(false);
          return;
        }
        setError(data.error || t('auth.errorStatus', { status: res.status }));
        setLoading(false);
        return;
      }

      // Replace history entry so back gesture doesn't return to login
      const target = data.onboarded ? '/dashboard' : '/onboarding';
      if (window.matchMedia('(display-mode: standalone)').matches) {
        window.location.replace(target);
      } else {
        router.replace(target);
      }
    } catch (err) {
      setError(t('auth.networkErrorDetail', { message: err instanceof Error ? err.message : String(err) }));
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('auth.error'));
        if (data.details) setError(data.details.join(', '));
        setLoading(false);
        return;
      }

      setSuccess(data.message || t('auth.registerSuccess'));
      setMode('login');
      setLoading(false);
    } catch {
      setError(t('auth.networkError'));
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/blason.png" alt="" className={styles.blason} />
          <img src="/logo.png" alt="CapBudget" className={styles.logoText} />
          <p>{mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.error} style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>{success}</div>}

        <form className={styles.form} onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          {mode === 'register' && (
            <div className={styles.field}>
              <label>{t('auth.name')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.namePlaceholder')} required />
            </div>
          )}

          <div className={styles.field}>
            <label>{t('auth.email')}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="votre@email.com" required />
          </div>

          <div className={styles.field}>
            <label>{t('auth.password')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          {needs2FA && (
            <div className={`${styles.field} ${styles.totpField}`}>
              <label>{t('auth.code2FA')}</label>
              <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" maxLength={6} required />
            </div>
          )}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? t('auth.loading') : mode === 'login' ? t('auth.login') : t('auth.register')}
          </button>
        </form>

        <div className={styles.links}>
          {mode === 'login' ? (
            <>
              <Link href="/forgot-password">{t('auth.forgotPassword')}</Link>
              <button onClick={() => { setMode('register'); setError(''); setSuccess(''); }} style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: '13px' }}>
                {t('auth.register')}
              </button>
            </>
          ) : (
            <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: '13px' }}>
              {t('auth.hasAccount')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
