// ============================================================================
// Environment Variable Validation
// ============================================================================
// Validates required env vars at startup. Fails fast with clear error messages.

interface EnvRule {
  key: string;
  required: boolean;
  minLength?: number;
  pattern?: RegExp;
  hint?: string;
}

const RULES: EnvRule[] = [
  {
    key: 'DATABASE_URL',
    required: true,
    hint: 'PostgreSQL connection string',
  },
  {
    key: 'JWT_SECRET',
    required: true,
    minLength: 32,
    hint: 'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  },
  {
    key: 'ENCRYPTION_KEY',
    required: true,
    minLength: 64,
    pattern: /^[0-9a-f]{64}$/i,
    hint: 'Must be 64 hex characters (256 bits). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  },
  {
    key: 'ENCRYPTION_KEY_VERSION',
    required: true,
    pattern: /^\d+$/,
    hint: 'Integer version number for the current encryption key',
  },
];

const DANGEROUS_DEFAULTS = [
  { key: 'JWT_SECRET', bad: 'capbudget-secret-key-change-in-production' },
];

export function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of RULES) {
    const value = process.env[rule.key];

    if (rule.required && (!value || value.trim() === '')) {
      errors.push(`Missing ${rule.key}. ${rule.hint || ''}`);
      continue;
    }

    if (value) {
      if (rule.minLength && value.length < rule.minLength) {
        errors.push(`${rule.key} must be at least ${rule.minLength} characters. ${rule.hint || ''}`);
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`${rule.key} has invalid format. ${rule.hint || ''}`);
      }
    }
  }

  // Check for dangerous default values in production
  if (process.env.NODE_ENV === 'production') {
    for (const check of DANGEROUS_DEFAULTS) {
      if (process.env[check.key] === check.bad) {
        errors.push(`${check.key} is using a default/insecure value in production!`);
      }
    }
  }

  if (!process.env.ENCRYPTION_KEY_PREV && process.env.NODE_ENV === 'production') {
    warnings.push('ENCRYPTION_KEY_PREV is not set. Key rotation will not work until it is configured.');
  }

  if (warnings.length > 0) {
    console.warn('[ENV] Warnings:\n' + warnings.join('\n'));
  }

  if (errors.length > 0) {
    const msg = '[ENV] Configuration errors:\n' + errors.join('\n');
    console.error(msg);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
  }
}
