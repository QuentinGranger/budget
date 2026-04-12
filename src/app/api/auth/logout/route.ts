import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { safeError } from '@/lib/logger';

export async function POST() {
  try {
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    safeError('POST /api/auth/logout', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
