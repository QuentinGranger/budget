'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ArrowLeftRight, PieChart, Target, BarChart3, Settings, LogOut,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import styles from './Sidebar.module.scss';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/budget', label: 'Budget', icon: PieChart },
  { href: '/goals', label: 'Objectifs', icon: Target },
  { href: '/analytics', label: 'Analytique', icon: BarChart3 },
  { href: '/settings', label: 'Parametres', icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useStore();
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
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`${styles.link} ${pathname === href ? styles.active : ''}`}
              onClick={handleNav}
            >
              <Icon size={18} />
              {label}
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
            Deconnexion
          </button>
        </div>
      </aside>
    </>
  );
}
