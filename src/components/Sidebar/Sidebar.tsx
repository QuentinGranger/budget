'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ArrowLeftRight, PieChart, Target, BarChart3, Settings, LogOut,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import styles from './Sidebar.module.scss';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/transactions', key: 'nav.transactions', icon: ArrowLeftRight },
  { href: '/budget', key: 'nav.budget', icon: PieChart },
  { href: '/goals', key: 'nav.goals', icon: Target },
  { href: '/analytics', key: 'nav.analytics', icon: BarChart3 },
  { href: '/settings', key: 'nav.settings', icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useStore();
  const { t } = useI18n();
  const user = state.user;

  const handleLogout = async () => {
    onClose();
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleNav = () => {
    onClose();
  };

  return (
    <>
      <div
        className={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}
        onClick={onClose}
      />
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          <img src="/blason.png" alt="CapBudget" className={styles.blason} />
          <img src="/logo.png" alt="CapBudget" className={styles.logoText} />
        </div>
        <div className={styles.divider} />

        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`${styles.link} ${pathname === href ? styles.active : ''}`}
              onClick={handleNav}
            >
              <Icon size={18} />
              {t(key)}
            </Link>
          ))}
        </nav>

        <div className={styles.footer}>
          {user && (
            <div className={styles.userInfo}>
              <div className={styles.avatar}>{user.name?.charAt(0).toUpperCase()}</div>
              <div>
                <div className={styles.userName}>{user.name}</div>
                <div className={styles.userEmail}>{user.email}</div>
              </div>
            </div>
          )}
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogOut size={18} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>
    </>
  );
}
