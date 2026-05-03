import { Resend } from 'resend';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
function getFromEmail() {
  return process.env.FROM_EMAIL || 'CapBudget <noreply@capbudget.app>';
}
function getAppUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

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
          <div style="font-size:12px;color:#6a6a82;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:32px;">Premium budget management</div>
          ${content}
          <div style="margin-top:36px;padding-top:20px;border-top:1px solid #1e1e2e;">
            <span style="font-size:11px;color:#4a4a62;letter-spacing:0.05em;">&copy; CapBudget — Your budget, mastered with elegance.</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = `${getAppUrl()}/verify-email?token=${token}`;

  const html = luxuryWrapper(`
    <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f0f0f5;">Welcome to CapBudget</h2>
    <p style="margin:0 0 28px;font-size:14px;color:#a0a0b8;line-height:1.6;">
      Your account has been created successfully. Click the button below to verify your email address and start managing your budget.
    </p>
    <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#b8922e,#d4a843,#e8c469);color:#08080c;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
      Verify my email
    </a>
    <p style="margin-top:24px;font-size:12px;color:#6a6a82;">This link expires in 24 hours.</p>
  `);

  const result = await getResend().emails.send({
    from: getFromEmail(),
    to: email,
    subject: 'Verify your email — CapBudget',
    html,
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  console.log('[EMAIL] Sent verification email, id:', result.data?.id);
}

export async function sendResetPasswordEmail(email: string, token: string) {
  const resetUrl = `${getAppUrl()}/reset-password?token=${token}`;

  const html = luxuryWrapper(`
    <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f0f0f5;">Password Reset</h2>
    <p style="margin:0 0 28px;font-size:14px;color:#a0a0b8;line-height:1.6;">
      You requested a password reset. Click the button below to choose a new password.
    </p>
    <a href="${resetUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#b8922e,#d4a843,#e8c469);color:#08080c;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
      Reset my password
    </a>
    <p style="margin-top:24px;font-size:12px;color:#6a6a82;">This link expires in 1 hour. If you did not request this, please ignore this email.</p>
  `);

  const result = await getResend().emails.send({
    from: getFromEmail(),
    to: email,
    subject: 'Password reset — CapBudget',
    html,
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  console.log('[EMAIL] Sent reset email, id:', result.data?.id);
}
