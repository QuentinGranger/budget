'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useStore } from '@/lib/store';
import Sidebar from '@/components/Sidebar/Sidebar';
import styles from './AppShell.module.scss';

const NO_SHELL_PATHS = ['/login', '/forgot-password', '/reset-password', '/onboarding', '/verify-email'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useStore();
  const [redirecting, setRedirecting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const needsOnboarding = !state.loading && state.user && !state.user.onboarded && pathname !== '/onboarding';
  const needsLogin = !state.loading && !state.user && !NO_SHELL_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (needsOnboarding) {
      setRedirecting(true);
      router.push('/onboarding');
    } else if (needsLogin) {
      setRedirecting(true);
      router.push('/login');
    }
  }, [needsOnboarding, needsLogin, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // No shell on auth/onboarding pages
  if (NO_SHELL_PATHS.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  // Loading or redirecting
  if (state.loading || redirecting) {
    return <div className={styles.loading}>Chargement...</div>;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.mobileHeader}>
        <button
          className={styles.hamburger}
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu size={22} />
        </button>
        <img src="/logo.png" alt="CapBudget" className={styles.mobileLogo} />
      </header>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
