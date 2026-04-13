'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useStore } from '@/lib/store';
import Sidebar from '@/components/Sidebar/Sidebar';
import QuickExpense from '@/components/QuickExpense/QuickExpense';
import styles from './AppShell.module.scss';

const NO_SHELL_PATHS = ['/login', '/forgot-password', '/reset-password', '/onboarding', '/verify-email'];
const SWIPE_THRESHOLD = 50;
const EDGE_ZONE = 30;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useStore();
  const [redirecting, setRedirecting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number; edge: boolean } | null>(null);

  const needsOnboarding = !state.loading && state.user && !state.user.onboarded && pathname !== '/onboarding';
  const needsLogin = !state.loading && !state.user && !NO_SHELL_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (needsOnboarding) {
      setRedirecting(true);
      router.replace('/onboarding');
    } else if (needsLogin) {
      setRedirecting(true);
      router.replace('/login');
    }
  }, [needsOnboarding, needsLogin, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Swipe gesture: edge swipe right opens sidebar, swipe left closes it
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    touchStart.current = { x, y, edge: x < EDGE_ZONE };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
    // Only horizontal swipes (not scrolling)
    if (dy > Math.abs(dx)) { touchStart.current = null; return; }
    // Swipe right from left edge → open sidebar
    if (dx > SWIPE_THRESHOLD && touchStart.current.edge && !sidebarOpen) {
      setSidebarOpen(true);
    }
    // Swipe left → close sidebar
    if (dx < -SWIPE_THRESHOLD && sidebarOpen) {
      setSidebarOpen(false);
    }
    touchStart.current = null;
  }, [sidebarOpen]);

  // No shell on auth/onboarding pages
  if (NO_SHELL_PATHS.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  // Loading or redirecting
  if (state.loading || redirecting) {
    return <div className={styles.loading}>Chargement...</div>;
  }

  return (
    <div
      className={styles.shell}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
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
      <QuickExpense />
    </div>
  );
}
