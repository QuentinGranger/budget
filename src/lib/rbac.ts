import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getVerifiedSession, clearSessionCookie, computeFingerprint, isSessionIdle } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';

// ---- Roles ----

export type Role = 'user' | 'admin' | 'support';

const ROLE_HIERARCHY: Record<Role, number> = {
  user: 0,
  support: 1,
  admin: 2,
};

export interface AuthContext {
  userId: string;
  role: Role;
  email: string;
}

// ---- Authentication ----

export async function authenticate(): Promise<AuthContext | null> {
  const hdrs = await headers();
  const ua = hdrs.get('user-agent') || '';
  // Extract IP for stronger fingerprint (L3)
  const xff = hdrs.get('x-forwarded-for');
  const ip = xff ? xff.split(',')[0]?.trim() : hdrs.get('x-real-ip') || undefined;
  const fingerprint = computeFingerprint(ua, ip);

  const session = await getVerifiedSession(fingerprint);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, email: true, tokenVersion: true, lastActivity: true },
  });

  if (!user) return null;

  // Token version mismatch
  if (user.tokenVersion !== session.tokenVersion) {
    await clearSessionCookie();
    return null;
  }

  // Idle session check
  if (isSessionIdle(user.lastActivity)) {
    await clearSessionCookie();
    return null;
  }

  // Touch lastActivity (non-blocking)
  prisma.user.update({ where: { id: user.id }, data: { lastActivity: new Date() } }).catch(() => {});

  return { userId: user.id, role: user.role as Role, email: decrypt(user.email) };
}

// ---- Role Checks ----

export function hasRole(auth: AuthContext, minRole: Role): boolean {
  return ROLE_HIERARCHY[auth.role] >= ROLE_HIERARCHY[minRole];
}

export function isAdmin(auth: AuthContext): boolean {
  return auth.role === 'admin';
}

// ---- Convenience Wrappers ----

export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const auth = await authenticate();
  if (!auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  return auth;
}

export async function requireRole(minRole: Role): Promise<AuthContext | NextResponse> {
  const auth = await authenticate();
  if (!auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  if (!hasRole(auth, minRole)) {
    return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
  }
  return auth;
}

export function isAuthError(result: AuthContext | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

// ---- IDOR Protection ----

type ModelName = 'transaction' | 'income' | 'goal' | 'category';

export async function verifyOwnership(
  model: ModelName,
  resourceId: string,
  auth: AuthContext,
  writeAccess: boolean = false
): Promise<{ owned: boolean }> {
  // Admin can access everything
  if (auth.role === 'admin') return { owned: true };
  // Support can read, not write
  if (auth.role === 'support' && !writeAccess) return { owned: true };

  const prismaModel = prisma[model] as unknown as { findUnique: (args: { where: { id: string }; select: { userId: boolean } }) => Promise<{ userId: string | null } | null> };
  const record = await prismaModel.findUnique({ where: { id: resourceId }, select: { userId: true } });

  if (!record) return { owned: false };
  return { owned: record.userId === auth.userId };
}

// ---- Audit Logging ----

export async function auditLog(
  userId: string,
  action: string,
  target?: string,
  details?: Record<string, unknown>,
  ip?: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        target: target || null,
        details: details ? JSON.stringify(details) : null,
        ip: ip || null,
      },
    });
  } catch (err) {
    console.error('[AUDIT] Failed to write audit log:', err);
  }
}
