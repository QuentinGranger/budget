import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPurposeToken } from '@/lib/auth';
import { safeError } from '@/lib/logger';

// POST — verify email via token in request body (not in URL to avoid leaking sensitive tokens)
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 400 });
    }

    const email = await verifyPurposeToken(token, 'email-verify');
    if (!email) {
      return NextResponse.json({ error: 'Token invalide ou expire' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: token },
    });

    if (!user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 400 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ ok: true, message: 'Email deja verifie' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    });

    return NextResponse.json({ ok: true, message: 'Email verifie avec succes' });
  } catch (err) {
    safeError('POST /api/auth/verify-email', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
