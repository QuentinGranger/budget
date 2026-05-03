import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUserId } from '@/lib/auth';
import { encrypt, decrypt } from '@/lib/crypto';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { safeError } from '@/lib/logger';

// POST — generate TOTP secret and QR code
export async function POST() {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: 'api.notAuthenticated' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, totpEnabled: true } });
    if (!user) return NextResponse.json({ error: 'api.userNotFound' }, { status: 404 });

    if (user.totpEnabled) {
      return NextResponse.json({ error: 'api.2faAlreadyEnabled' }, { status: 400 });
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    const plainEmail = decrypt(user.email);

    const totp = new OTPAuth.TOTP({
      issuer: 'CapBudget',
      label: plainEmail,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const uri = totp.toString();
    const qrCode = await QRCode.toDataURL(uri);

    // Store encrypted secret temporarily
    const encryptedSecret = encrypt(secret.base32);
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptedSecret },
    });

    return NextResponse.json({ qrCode, secret: secret.base32 });
  } catch (err) {
    safeError('POST /api/auth/2fa/setup', err);
    return NextResponse.json({ error: 'api.serverError' }, { status: 500 });
  }
}
