import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'crypto';

// ---- Constants ----

function getJwtSecret(): Uint8Array {
  if (!process.env.JWT_SECRET) {
    throw new Error('[SECURITY] JWT_SECRET environment variable is required');
  }
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

export const COOKIE_NAME = 'capbudget-session';
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days
const IDLE_SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days idle

// Brute force
export const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const AUTH_ERROR_NEUTRAL = 'Email ou mot de passe incorrect';
export const AUTH_ERROR_LOCKED = 'Compte temporairement verrouille. Reessayez plus tard.';
export const AUTH_ERROR_RATE_LIMITED = 'Trop de tentatives. Reessayez plus tard.';
export const AUTH_ERROR_2FA_REQUIRED = '2FA_REQUIRED';

export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// ---- Password ----

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---- Password Policy ----

export function validatePasswordPolicy(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Au moins 8 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Au moins une majuscule');
  if (!/[a-z]/.test(password)) errors.push('Au moins une minuscule');
  if (!/[0-9]/.test(password)) errors.push('Au moins un chiffre');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Au moins un caractere special');
  return { valid: errors.length === 0, errors };
}

// ---- JWT Session ----

export async function signSessionToken(userId: string, tokenVersion: number = 0, fingerprint: string = ''): Promise<string> {
  return new SignJWT({ userId, tokenVersion, fingerprint })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<{ userId: string; tokenVersion: number; fingerprint: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: payload.userId as string,
      tokenVersion: (payload.tokenVersion as number) ?? 0,
      fingerprint: (payload.fingerprint as string) ?? '',
    };
  } catch {
    return null;
  }
}

// ---- Purpose Tokens (email verify, reset) ----

export async function signEmailVerifyToken(email: string): Promise<string> {
  return new SignJWT({ email, purpose: 'email-verify' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecret());
}

export async function signResetToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: 'reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getJwtSecret());
}

export async function verifyPurposeToken(token: string, purpose: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.purpose !== purpose) return null;
    if (purpose === 'email-verify') return payload.email as string;
    if (purpose === 'reset') return payload.userId as string;
    return null;
  } catch {
    return null;
  }
}

// ---- Fingerprint ----

export function computeFingerprint(userAgent: string, ip?: string): string {
  const data = ip ? `${userAgent}|${ip}` : userAgent;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

// ---- Cookie Management ----

export async function setSessionCookie(userId: string, tokenVersion: number = 0, fingerprint: string = '') {
  const token = await signSessionToken(userId, tokenVersion, fingerprint);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  return session?.userId ?? null;
}

export async function getVerifiedSession(fingerprint?: string): Promise<{ userId: string; tokenVersion: number; fingerprint: string } | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  if (fingerprint && session.fingerprint && session.fingerprint !== fingerprint) return null;
  return session;
}

// ---- Account Lockout ----

export function isAccountLocked(lockedUntil: Date | null): boolean {
  if (!lockedUntil) return false;
  return new Date() < new Date(lockedUntil);
}

export function getLockoutUntil(): Date {
  return new Date(Date.now() + LOCKOUT_DURATION_MS);
}

// ---- Idle Session ----

export function isSessionIdle(lastActivity: Date | null): boolean {
  if (!lastActivity) return false;
  return Date.now() - new Date(lastActivity).getTime() > IDLE_SESSION_TIMEOUT_MS;
}

// ---- Password History (L5) ----

const PASSWORD_HISTORY_COUNT = 5;

export async function isPasswordReused(userId: string, newPassword: string): Promise<boolean> {
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_COUNT,
    select: { passwordHash: true },
  });
  for (const entry of history) {
    if (await bcrypt.compare(newPassword, entry.passwordHash)) return true;
  }
  return false;
}

export async function savePasswordToHistory(userId: string, passwordHash: string): Promise<void> {
  await prisma.passwordHistory.create({ data: { userId, passwordHash } });
  // Prune old entries beyond limit
  const all = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (all.length > PASSWORD_HISTORY_COUNT) {
    const toDelete = all.slice(PASSWORD_HISTORY_COUNT).map((e) => e.id);
    await prisma.passwordHistory.deleteMany({ where: { id: { in: toDelete } } });
  }
}

// ---- Rate Limiting ----
// Delegated to src/lib/rate-limit.ts (supports Redis + in-memory with cleanup).
// Re-export for backward compatibility with existing callers.
export { checkAuthRateLimit as checkRateLimit } from '@/lib/rate-limit';

// ---- Secure Token Generation ----

export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}
