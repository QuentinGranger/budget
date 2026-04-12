import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.FROM_EMAIL || 'CapBudget <onboarding@resend.dev>';
const appUrl = process.env.APP_URL || 'http://localhost:3000';

function luxuryWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#08080c;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#08080c;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#14141c,#0e0e14);border:1px solid #2a2a3a;border-radius:16px;overflow:hidden;">
        <tr><td style="height:3px;background:linear-gradient(90deg,#b8922e,#d4a843,#e8c469,#d4a843,#b8922e);"></td></tr>
        <tr><td style="padding:40px 36px 36px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#d4a843;letter-spacing:0.02em;margin-bottom:6px;">CapBudget</div>
          <div style="font-size:12px;color:#6a6a82;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:32px;">Gestion de budget premium</div>
          ${content}
          <div style="margin-top:36px;padding-top:20px;border-top:1px solid #1e1e2e;">
            <span style="font-size:11px;color:#4a4a62;letter-spacing:0.05em;">&copy; CapBudget — Votre budget, maitrise avec elegance.</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;

  const html = luxuryWrapper(`
    <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f0f0f5;">Bienvenue sur CapBudget</h2>
    <p style="margin:0 0 28px;font-size:14px;color:#a0a0b8;line-height:1.6;">
      Votre compte a ete cree avec succes. Cliquez sur le bouton ci-dessous pour verifier votre adresse email et commencer a gerer votre budget.
    </p>
    <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#b8922e,#d4a843,#e8c469);color:#08080c;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
      Verifier mon email
    </a>
    <p style="margin-top:24px;font-size:12px;color:#6a6a82;">Ce lien expire dans 24 heures.</p>
  `);

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: 'Verifiez votre email — CapBudget',
    html,
  });
}

export async function sendResetPasswordEmail(email: string, token: string) {
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  const html = luxuryWrapper(`
    <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f0f0f5;">Reinitialisation de mot de passe</h2>
    <p style="margin:0 0 28px;font-size:14px;color:#a0a0b8;line-height:1.6;">
      Vous avez demande la reinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
    </p>
    <a href="${resetUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#b8922e,#d4a843,#e8c469);color:#08080c;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
      Reinitialiser mon mot de passe
    </a>
    <p style="margin-top:24px;font-size:12px;color:#6a6a82;">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
  `);

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: 'Reinitialisation de mot de passe — CapBudget',
    html,
  });
}
