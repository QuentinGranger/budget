import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { StoreProvider } from '@/lib/store';
import { I18nProvider } from '@/lib/i18n';
import AppShell from '@/components/AppShell/AppShell';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import '@/styles/globals.scss';

export const metadata: Metadata = {
  title: 'CapBudget — Gestion de Budget 50/30/20',
  description: 'Application de gestion de budget personnel basee sur la regle 50/30/20',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CapBudget',
  },
  applicationName: 'CapBudget',
};

export const viewport: Viewport = {
  themeColor: '#08080c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // headers() forces dynamic rendering — required for CSP nonce injection.
  // Next.js auto-extracts the nonce from the CSP header; no manual prop passing needed.
  await headers();

  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        <ServiceWorkerRegistrar />
        <I18nProvider>
          <StoreProvider>
            <AppShell>{children}</AppShell>
          </StoreProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
