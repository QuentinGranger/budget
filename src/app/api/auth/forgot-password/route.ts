import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signResetToken, checkRateLimit, RESET_TOKEN_EXPIRY_MS } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { hmacHash, decrypt } from '@/lib/crypto';
import { sendResetPasswordEmail } from '@/lib/email';
import { safeError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Reessayez plus tard.' }, { status: 429 });
    }

    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    // Always return success to avoid email enumeration
    const successMsg = { ok: true, message: 'Si un compte existe, un email de reinitialisation a ete envoye.' };

    const normalizedEmail = email.toLowerCase().trim();
    const emailHashValue = hmacHash(normalizedEmail);

    const user = await prisma.user.findUnique({ where: { emailHash: emailHashValue } });
    if (!user) {
      return NextResponse.json(successMsg);
    }

    const resetToken = await signResetToken(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
      },
    });

    const plainEmail = decrypt(user.email);
    try {
      await sendResetPasswordEmail(plainEmail, resetToken);
    } catch (err) {
      safeError('Failed to send reset email', err);
    }

    return NextResponse.json(successMsg);
  } catch (err) {
    safeError('POST /api/auth/forgot-password', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
