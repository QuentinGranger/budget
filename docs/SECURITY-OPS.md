# Security Operations — CapBudget

Guide opérationnel des mécanismes de sécurité en place après l'audit du 6 avril 2026.

---

## 1. Authentification & Sessions

| Mécanisme | Valeur | Fichier |
|-----------|--------|---------|
| Hashing | bcrypt 12 rounds | `lib/auth.ts` |
| JWT | HS256, 7 jours max | `lib/auth.ts` |
| Cookie | HttpOnly, Secure, SameSite=Lax | `lib/auth.ts` |
| Idle timeout | 7 jours d'inactivité | `lib/auth.ts` |
| Fingerprint | SHA-256(User-Agent + IP) | `lib/auth.ts` |
| Lockout | 5 échecs → 15 min | `lib/auth.ts` |
| Password policy | 8+ chars, majuscule, minuscule, chiffre, spécial | `lib/auth.ts` |
| Password history | 5 derniers hashes (bcrypt compare) | `lib/auth.ts` + `PasswordHistory` model |
| Token version | Incrémenté lors de logout-all / password change | `lib/rbac.ts` |
| 2FA | TOTP (otpauth), brute-force limité 5/5min | `api/auth/2fa/*` |

### Changement de mot de passe
- **Route** : `POST /api/auth/change-password`
- Vérifie mot de passe actuel, valide la politique, check l'historique (5 derniers)
- Invalide toutes les autres sessions (`tokenVersion++`)

---

## 2. Rate Limiting

**Fichier** : `src/lib/rate-limit.ts`

| Endpoint | Limite | Fenêtre |
|----------|--------|---------|
| Auth (login, register, forgot, reset) | 10 req | 1 min |
| TOTP verification | 5 tentatives | 5 min |

**Backend** :
- **Production** : Upstash Redis (sliding window) via `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- **Fallback** : In-memory Map avec cleanup automatique et éviction LRU (max 10 000 entrées)

**IP extraction** : `getClientIp(req)` utilise `TRUSTED_PROXY_COUNT` pour extraire l'IP réelle de `x-forwarded-for`. Par défaut : IP directe du socket.

---

## 3. Middleware Security (`src/middleware.ts`)

### Ordre d'exécution
1. HTTPS redirect (production)
2. Skip static assets
3. **CSRF check** (toutes mutations API, y compris routes publiques)
4. **Body size limit** (1 Mo max)
5. Public path bypass
6. Session verification (JWT)

### CSRF Protection
- Vérifie `Origin` ou `Referer` header sur POST/PUT/DELETE vers `/api/`
- Compare le host d'origine au host de la requête
- Mode strict : rejette si ni Origin ni Referer n'est présent
- Retourne `403` si cross-origin

### Security Headers (12 headers)
| Header | Valeur |
|--------|--------|
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload |
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=(), usb=() |
| X-XSS-Protection | 1; mode=block |
| Cross-Origin-Opener-Policy | same-origin |
| Cross-Origin-Embedder-Policy | require-corp |
| X-DNS-Prefetch-Control | off |
| Content-Security-Policy | Nonce-based (voir ci-dessous) |
| x-nonce | Nonce unique par requête (pour Next.js) |

### CSP (Content-Security-Policy)
- **Production** : `script-src 'self' 'nonce-{random}' 'unsafe-inline'` — les navigateurs CSP2+ ignorent `unsafe-inline` quand un nonce est présent
- **Dev** : ajoute `'unsafe-eval'` (requis pour HMR)
- `style-src 'self' 'unsafe-inline'` — nécessaire pour CSS modules/Sass
- `frame-ancestors 'none'` — équivalent X-Frame-Options

---

## 4. Chiffrement au repos

**Fichier** : `src/lib/crypto.ts`

| Algorithme | Usage |
|------------|-------|
| AES-256-GCM | Chiffrement des champs sensibles |
| HMAC-SHA256 | Hash non-réversible pour lookup email |

**Champs chiffrés** : `User.email`, `User.totpSecret`, `Transaction.description`, `Transaction.note`, `Income.label`

**Rotation de clé** : Support versionnement via `ENCRYPTION_KEY` + `ENCRYPTION_KEY_PREV`

---

## 5. RBAC & IDOR

**Fichier** : `src/lib/rbac.ts`

- Hiérarchie : `user` < `support` < `admin`
- `authenticate()` : vérifie session + fingerprint + tokenVersion + idle timeout
- `verifyOwnership()` : protection IDOR sur toutes les routes de données
- `userId` toujours dérivé de la session, jamais du client

---

## 6. Audit Logging

**Table** : `AuditLog` (userId, action, target, details, ip, createdAt)

### Actions tracées
| Action | Route |
|--------|-------|
| `login:success` | `/api/auth/login` |
| `login:failed` | `/api/auth/login` (avec raison + nb tentatives) |
| `password:changed` | `/api/auth/change-password` |
| `password:reset` | `/api/auth/reset-password` |
| `2fa:enabled` | `/api/auth/2fa/enable` |
| `2fa:disabled` | `/api/auth/2fa/disable` |
| `session:logout-all` | `/api/auth/logout-all` |
| `account:deleted` | `/api/user` DELETE |
| `admin.view_users` | `/api/admin/users` GET |
| `admin.delete_user` | `/api/admin/users` DELETE |

---

## 7. Safe Logger

**Fichier** : `src/lib/logger.ts`

`safeError(context, err)` remplace `console.error` dans toutes les routes API.

**Comportement** :
- **Production** : log uniquement `[ERROR] context — ErrorName: message` (pas de stack, pas de payload)
- **Dev** : log l'erreur complète mais avec redaction des clés sensibles

**Clés redactées** : `password`, `currentPassword`, `newPassword`, `passwordHash`, `token`, `resetToken`, `emailVerifyToken`, `totpSecret`, `totpCode`, `secret`, `authorization`, `cookie`, `email`, `JWT_SECRET`, `ENCRYPTION_KEY`

---

## 8. Service Worker

**Fichier** : `public/sw.js`

- **Assets statiques** : cache-first (images, fonts, CSS, JS)
- **API** : network-only, jamais caché
- **Pages HTML** : network-only, **jamais cachées** (données financières sensibles)

---

## 9. Input Validation

**Fichier** : `src/lib/validation.ts`

Toutes les routes POST/PUT utilisent des helpers centralisés :
- `requireFloat()`, `requireString()`, `requireEnum()`, `requireDate()`
- `safeFloat()`, `safeInt()`, `optionalString()`, `optionalEnum()`, `optionalBool()`
- Limites : `MAX_AMOUNT` (999 999), `MAX_NAME_LENGTH` (100), `MAX_DESCRIPTION_LENGTH` (500), `MAX_NOTE_LENGTH` (1000)
- Whitelists : `PILLARS`, `CURRENCIES`, `INCOME_CATEGORIES`, `INCOME_FREQUENCIES`

---

## 10. Variables d'environnement requises

| Variable | Requis | Description |
|----------|--------|-------------|
| `JWT_SECRET` | ✅ | Clé HS256 (min 32 chars) |
| `ENCRYPTION_KEY` | ✅ | Hex 64 chars (AES-256) |
| `ENCRYPTION_KEY_VERSION` | ✅ | Version de la clé courante |
| `ENCRYPTION_KEY_PREV` | ⚠️ | Ancienne clé (rotation) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `UPSTASH_REDIS_REST_URL` | ⚠️ | Redis pour rate limiting (prod) |
| `UPSTASH_REDIS_REST_TOKEN` | ⚠️ | Token Redis |
| `TRUSTED_PROXY_COUNT` | ⚠️ | Nombre de proxies de confiance (défaut: 0) |
| `RESEND_API_KEY` | ✅ | API key Resend (emails) |
| `APP_URL` | ✅ | URL de l'application |

⚠️ = Recommandé en production, fallback disponible.
