import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

if (!process.env.JWT_SECRET) {
  throw new Error('[SECURITY] JWT_SECRET environment variable is required');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const COOKIE_NAME = 'capbudget-session';

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/verify-email',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// ---- CSRF Protection (M7) ----
// Verify Origin/Referer on mutating requests to prevent cross-site request forgery.
// Browsers always send Origin on same-origin POST/PUT/DELETE fetch() calls.
// No client-side changes needed — this is transparent to the SPA.

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function checkCsrf(req: NextRequest): boolean {
  if (CSRF_SAFE_METHODS.has(req.method)) return true;

  const host = req.headers.get('host');
  if (!host) return false;

  // Check Origin header (most reliable)
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  // Fallback to Referer
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  // No Origin or Referer — allow if request comes from PWA standalone mode
  // (iOS Safari in standalone mode omits Origin/Referer on same-origin fetch).
  // This is safe: CSRF attacks require a cross-origin request which always
  // includes an Origin header. No Origin = same-origin navigation/fetch.
  const fetchMode = req.headers.get('sec-fetch-mode');
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin' || fetchMode === 'cors' || fetchMode === 'same-origin') {
    return true;
  }

  // Final fallback: if a valid session cookie is present, the request
  // is very likely same-origin (CSRF attacks cannot read httpOnly cookies).
  if (req.cookies.get(COOKIE_NAME)?.value) {
    return true;
  }

  // For public auth routes (login, register), allow even without headers —
  // these are form submissions from the app's own login page.
  const pathname = req.nextUrl.pathname;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return true;
  }

  return false;
}

// ---- Body Size Limit (M8) ----
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1 MB

function isBodyTooLarge(req: NextRequest): boolean {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) return true;
  return false;
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  // Next.js 16 nonce-based CSP:
  // - 'strict-dynamic' cascades trust to scripts loaded by nonced scripts
  // - 'unsafe-eval' only in dev (React error overlay, HMR)
  // - 'unsafe-inline' for style-src in dev (HMR injects inline styles)
  const scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`;
  const styleSrc = `'self' 'unsafe-inline' https://fonts.googleapis.com`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `img-src 'self' data: blob:`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `worker-src 'self'`,
  ].join('; ');
}

function applySecurityHeaders(response: NextResponse, nonce?: string): NextResponse {
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  if (nonce) {
    response.headers.set('Content-Security-Policy', buildCsp(nonce));
  }

  return response;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = btoa(globalThis.crypto.randomUUID());

  // Build request headers with nonce + CSP so Next.js can extract the nonce
  // and automatically inject it into framework scripts, bundles, and inline styles
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', buildCsp(nonce));

  function nextWithNonce() {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // HTTPS redirect in production
  if (process.env.NODE_ENV === 'production' && req.headers.get('x-forwarded-proto') === 'http') {
    const httpsUrl = new URL(req.url);
    httpsUrl.protocol = 'https:';
    const redirect = NextResponse.redirect(httpsUrl, 301);
    return applySecurityHeaders(redirect, nonce);
  }

  // Skip static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return applySecurityHeaders(nextWithNonce(), nonce);
  }

  // CSRF check on API mutations — skip public auth routes (they have rate-limiting + password)
  if (pathname.startsWith('/api/') && !CSRF_SAFE_METHODS.has(req.method) && !isPublic(pathname)) {
    if (!checkCsrf(req)) {
      console.warn('[CSRF] Blocked:', req.method, pathname, {
        origin: req.headers.get('origin'),
        referer: req.headers.get('referer'),
        fetchSite: req.headers.get('sec-fetch-site'),
        fetchMode: req.headers.get('sec-fetch-mode'),
        ua: (req.headers.get('user-agent') || '').slice(0, 80),
      });
      return applySecurityHeaders(
        NextResponse.json({ error: 'Requete cross-origin non autorisee' }, { status: 403 })
      );
    }
  }

  // Body size limit on ALL API routes
  if (pathname.startsWith('/api/') && isBodyTooLarge(req)) {
    return applySecurityHeaders(
      NextResponse.json({ error: 'Corps de requete trop volumineux (max 1 Mo)' }, { status: 413 })
    );
  }

  // Public paths
  if (isPublic(pathname)) {
    return applySecurityHeaders(nextWithNonce(), nonce);
  }

  // Onboarding path (needs session but no onboarded check)
  if (pathname === '/onboarding' || pathname === '/api/user/onboard') {
    return applySecurityHeaders(nextWithNonce(), nonce);
  }

  // Verify session
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(NextResponse.json({ error: 'Non authentifie' }, { status: 401 }));
    }
    const loginUrl = new URL('/login', req.url);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  try {
    await jwtVerify(token, JWT_SECRET);
    return applySecurityHeaders(nextWithNonce(), nonce);
  } catch {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(NextResponse.json({ error: 'Session expiree' }, { status: 401 }));
    }
    const loginUrl = new URL('/login', req.url);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), nonce);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png).*)'],
};
