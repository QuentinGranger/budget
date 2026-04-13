import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, validatePasswordPolicy, signEmailVerifyToken, checkRateLimit } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { encrypt, hmacHash } from '@/lib/crypto';
import { sendVerificationEmail } from '@/lib/email';
import { safeError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Reessayez plus tard.' }, { status: 429 });
    }

    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    const policy = validatePasswordPolicy(password);
    if (!policy.valid) {
      return NextResponse.json({ error: 'Mot de passe trop faible', details: policy.errors }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHashValue = hmacHash(normalizedEmail);

    // Neutral response to avoid email enumeration
    const neutralMsg = 'Si aucun compte n\'existe avec cet email, un lien de verification vous a ete envoye.';

    // Check uniqueness via emailHash
    const existing = await prisma.user.findUnique({ where: { emailHash: emailHashValue } });
    if (existing) {
      // Don't reveal the account exists — return same neutral message
      return NextResponse.json({ ok: true, message: neutralMsg });
    }

    const passwordHash = await hashPassword(password);
    const encryptedEmail = encrypt(normalizedEmail);
    const verifyToken = await signEmailVerifyToken(normalizedEmail);

    await prisma.user.create({
      data: {
        name,
        email: encryptedEmail,
        emailHash: emailHashValue,
        passwordHash,
        emailVerifyToken: verifyToken,
        emailVerified: false,
      },
    });

    // Send verification email (must await on serverless platforms)
    try {
      console.log('[REGISTER] Sending verification email to:', normalizedEmail.replace(/(.{2}).*(@.*)/, '$1***$2'));
      await sendVerificationEmail(normalizedEmail, verifyToken);
      console.log('[REGISTER] Verification email sent successfully');
    } catch (err) {
      console.error('[REGISTER] Email send FAILED:', err instanceof Error ? err.message : String(err));
      safeError('Failed to send verification email', err);
    }

    return NextResponse.json({ ok: true, message: neutralMsg });
  } catch (err) {
    safeError('POST /api/auth/register', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
