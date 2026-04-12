// Safe logger — strips sensitive data from error objects before logging.
// Prevents accidental leaks of passwords, tokens, emails, secrets in server logs.

const SENSITIVE_KEYS = new Set([
  'password', 'currentPassword', 'newPassword', 'passwordHash',
  'token', 'resetToken', 'emailVerifyToken', 'totpSecret', 'totpCode',
  'secret', 'authorization', 'cookie', 'email',
  'JWT_SECRET', 'ENCRYPTION_KEY', 'ENCRYPTION_KEY_PREV',
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[nested]';

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (typeof value === 'string') {
    // Truncate very long strings that might contain encoded secrets
    return value.length > 500 ? value.slice(0, 500) + '...[truncated]' : value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1));
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitize(val, depth + 1);
      }
    }
    return sanitized;
  }

  return value;
}

export function safeError(context: string, err: unknown): void {
  if (process.env.NODE_ENV === 'production') {
    // In production, log only the context + error name/message (no stack)
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[ERROR] ${context} — ${msg}`);
  } else {
    // In dev, log sanitized full error for debugging
    console.error(`[ERROR] ${context}`, sanitize(err));
  }
}
