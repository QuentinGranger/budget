import crypto from 'crypto';

// ============================================================================
// AES-256-GCM Encryption at Rest
// ============================================================================
// Encrypts sensitive data (emails, notes, financial details) before storing
// in PostgreSQL. Supports key rotation via versioned keys.
//
// Format: "v<version>:<iv_hex>:<authTag_hex>:<ciphertext_hex>"

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;     // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;    // 128-bit auth tag

// ---- Key Management ----
// Keys are loaded from environment variables. Multiple versions allow rotation.
// ENCRYPTION_KEY        = current key (version stored in ENCRYPTION_KEY_VERSION)
// ENCRYPTION_KEY_PREV   = previous key (for decryption of old data)
// Each key must be exactly 64 hex characters (32 bytes / 256 bits).

interface EncryptionKey {
  version: number;
  key: Buffer;
}

function loadKeys(): { current: EncryptionKey; previous: EncryptionKey | null } {
  const currentHex = process.env.ENCRYPTION_KEY;
  const currentVersion = parseInt(process.env.ENCRYPTION_KEY_VERSION || '1', 10);
  const prevHex = process.env.ENCRYPTION_KEY_PREV || undefined;
  const prevVersion = parseInt(process.env.ENCRYPTION_KEY_PREV_VERSION || '0', 10);

  if (!currentHex || currentHex.length !== 64) {
    throw new Error(
      '[CRYPTO] ENCRYPTION_KEY must be set as a 64-char hex string (256 bits). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const current: EncryptionKey = {
    version: currentVersion,
    key: Buffer.from(currentHex, 'hex'),
  };

  let previous: EncryptionKey | null = null;
  if (prevHex && prevHex.length === 64 && prevVersion > 0) {
    previous = {
      version: prevVersion,
      key: Buffer.from(prevHex, 'hex'),
    };
  }

  return { current, previous };
}

// Lazy-loaded keys (loaded once on first use)
let _keys: { current: EncryptionKey; previous: EncryptionKey | null } | null = null;

function getKeys() {
  if (!_keys) _keys = loadKeys();
  return _keys;
}

// ---- Encrypt ----

export function encrypt(plaintext: string): string {
  if (!plaintext) return '';

  const { current } = getKeys();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, current.key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v${current.version}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ---- Decrypt ----

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';

  // Not encrypted (plain text from before encryption was enabled)
  if (!ciphertext.startsWith('v')) return ciphertext;

  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('[CRYPTO] Invalid ciphertext format');
  }

  const version = parseInt(parts[0].slice(1), 10);
  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const encrypted = Buffer.from(parts[3], 'hex');

  const { current, previous } = getKeys();

  // Find the right key for this version
  let key: Buffer;
  if (version === current.version) {
    key = current.key;
  } else if (previous && version === previous.version) {
    key = previous.key;
  } else {
    throw new Error(`[CRYPTO] No key found for version ${version}. Check ENCRYPTION_KEY_PREV.`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

// ---- Re-encrypt (for key rotation) ----
// Decrypts with whatever key version was used, then re-encrypts with current key.

export function reEncrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith('v')) {
    // Plain text — encrypt for the first time
    return encrypt(ciphertext);
  }

  const version = parseInt(ciphertext.split(':')[0].slice(1), 10);
  const { current } = getKeys();

  // Already on current key version — no re-encryption needed
  if (version === current.version) return ciphertext;

  const plaintext = decrypt(ciphertext);
  return encrypt(plaintext);
}

// ---- Check if a value is encrypted ----

export function isEncrypted(value: string): boolean {
  return /^v\d+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(value);
}

// ---- Hash (non-reversible, for indexing encrypted fields) ----
// HMAC-SHA256 with the current encryption key — allows searching without decrypting.

export function hmacHash(value: string): string {
  const { current } = getKeys();
  return crypto.createHmac('sha256', current.key).update(value.toLowerCase().trim()).digest('hex');
}
