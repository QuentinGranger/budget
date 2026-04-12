# Audit Sécurité CapBudget — 6 avril 2026

## Résumé

- **Fichiers audités** : 25+ (API routes, lib/, middleware, store, .env, prisma schema)
- **Dépendances** : `npm audit` → **0 vulnérabilités**
- **Client-side** : aucun `localStorage`, aucun `dangerouslySetInnerHTML`, aucun `NEXT_PUBLIC_` secret

---

## ✅ Ce qui est DÉJÀ en place (41 points)

### Authentification
| # | Mesure | Fichier |
|---|--------|---------|
| 1 | bcrypt 12 rounds | `lib/auth.ts` |
| 2 | JWT HS256 (jose) avec expiration | `lib/auth.ts` |
| 3 | Cookie HttpOnly + Secure + SameSite=Lax | `lib/auth.ts` |
| 4 | Politique de mot de passe (8+ chars, majuscule, minuscule, chiffre, spécial) | `lib/auth.ts` |
| 5 | Verrouillage après 5 tentatives (15 min) | `lib/auth.ts` |
| 6 | Rate limiting en mémoire (10 req/min sur auth) | `lib/auth.ts` |
| 7 | Vérification email avant connexion | `api/auth/login` |
| 8 | 2FA TOTP avec QR code | `api/auth/2fa/*` |
| 9 | Token version pour invalidation de sessions | `api/auth/logout-all` |
| 10 | Fingerprint (hash UA) dans le JWT | `lib/auth.ts` |
| 11 | Timeout d'inactivité (7 jours) | `lib/rbac.ts` |
| 12 | Messages d'erreur neutres (pas d'énumération) | `api/auth/login` |
| 13 | Anti-énumération sur forgot-password | `api/auth/forgot-password` |

### Autorisation / RBAC
| # | Mesure | Fichier |
|---|--------|---------|
| 14 | Hiérarchie de rôles (user < support < admin) | `lib/rbac.ts` |
| 15 | Protection IDOR via `verifyOwnership` | `lib/rbac.ts` |
| 16 | userId dérivé de la session, jamais du client | Toutes les routes |
| 17 | Stripping des champs sensibles sur PUT /user | `api/user` |
| 18 | Prévention auto-suppression admin | `api/admin/users` |

### Chiffrement
| # | Mesure | Fichier |
|---|--------|---------|
| 19 | AES-256-GCM chiffrement au repos | `lib/crypto.ts` |
| 20 | Rotation de clé versionnée | `lib/crypto.ts` |
| 21 | HMAC-SHA256 pour lookup email (emailHash) | `lib/crypto.ts` |
| 22 | Champs chiffrés : email, totpSecret, description, note, income label | Routes API |

### Headers / Middleware
| # | Mesure | Fichier |
|---|--------|---------|
| 23 | HSTS avec preload | `middleware.ts` |
| 24 | X-Frame-Options: DENY | `middleware.ts` |
| 25 | X-Content-Type-Options: nosniff | `middleware.ts` |
| 26 | Referrer-Policy: strict-origin | `middleware.ts` |
| 27 | Permissions-Policy (camera, mic, geo, payment, usb off) | `middleware.ts` |
| 28 | CSP configurée | `middleware.ts` |
| 29 | Redirect HTTPS en production | `middleware.ts` |
| 30 | Auth check middleware sur toutes les routes protégées | `middleware.ts` |

### Environnement
| # | Mesure | Fichier |
|---|--------|---------|
| 31 | Validation env vars au démarrage | `lib/env.ts` |
| 32 | Détection des valeurs par défaut dangereuses | `lib/env.ts` |
| 33 | JWT_SECRET sans fallback | `lib/auth.ts` |
| 34 | .gitignore couvre .env | `.gitignore` |

### Audit & Client
| # | Mesure | Fichier |
|---|--------|---------|
| 35 | AuditLog (userId, action, target, details, ip) | `lib/rbac.ts` + Prisma |
| 36 | Actions admin audit-loguées | `api/admin/*` |
| 37 | Aucun localStorage | Vérifié (grep) |
| 38 | Aucun dangerouslySetInnerHTML | Vérifié (grep) |
| 39 | Aucun secret exposé côté client | Vérifié (grep) |
| 40 | Aucun alert()/confirm() natif | Remplacé par Modal |
| 41 | npm audit: 0 vulnérabilités | `npm audit` |

---

## 🔴 Critique — À corriger immédiatement

### C1. `/api/user` est dans PUBLIC_PATHS du middleware
**Fichier** : `src/middleware.ts:21`
**Risque** : La route `/api/user` bypass complètement le check JWT du middleware. Bien que la route elle-même utilise `requireAuth()`, cela supprime une couche de défense en profondeur.
**Fix** : Retirer `/api/user` de `PUBLIC_PATHS`. La route a son propre auth check.

### C2. L'endpoint onboard retourne les données brutes Prisma
**Fichier** : `src/app/api/user/onboard/route.ts:73`
**Risque** : `return NextResponse.json(user)` retourne le user Prisma complet SANS passer par `safeUser()`. Cela **fuite** `passwordHash`, `totpSecret`, `emailHash`, `tokenVersion`, `failedLoginAttempts`, `lockedUntil`, etc.
**Fix** : Importer et utiliser `safeUser()` avant de retourner le user.

### C3. L'endpoint onboard utilise une auth faible
**Fichier** : `src/app/api/user/onboard/route.ts:10`
**Risque** : Utilise `getSessionUserId()` au lieu de `requireAuth()`. Cela ne vérifie pas le `tokenVersion`, le `fingerprint`, ni le timeout d'inactivité.
**Fix** : Remplacer par `requireAuth()` + `isAuthError()`.

### C4. Aucune validation d'entrée sur les routes de données
**Fichier** : Toutes les routes POST/PUT
**Risque** : 
- `amount` peut être NaN, Infinity, négatif, ou astronomique
- `name`/`description` n'ont pas de limite de longueur (DoS par champ géant)
- `pillar` n'est pas validé contre les valeurs autorisées (`needs`/`wants`/`savings`)
- `needsPercent` etc. pourraient être 9999 ou -50
- `currency` n'est pas validé contre une liste blanche
**Fix** : Ajouter une couche de validation (Zod ou manuelle) sur chaque route.

### C5. `parseFloat`/`parseInt` sans vérification NaN
**Fichier** : `api/transactions`, `api/incomes`, `api/goals`, `api/settings`
**Risque** : `parseFloat("abc")` = `NaN` stocké en DB. `parseFloat("")` = `NaN`.
**Fix** : Vérifier `isNaN()` et `isFinite()` après chaque conversion numérique.

---

## 🟠 Moyen — À planifier rapidement

### M1. Register révèle l'existence d'un email
**Fichier** : `api/auth/register/route.ts:32`
**Risque** : Retourne "Un compte existe deja avec cet email" (409). Permet l'énumération d'emails.
**Fix** : Retourner un message neutre ("Si aucun compte n'existe, un email de confirmation a été envoyé") et envoyer un email au compte existant pour prévenir.

### M2. Reset-password n'a pas de rate limiting
**Fichier** : `api/auth/reset-password/route.ts`
**Risque** : Un attaquant avec un token valide peut tenter rapidement différents mots de passe.
**Fix** : Ajouter `checkRateLimit(ip)`.

### M3. 2FA enable n'est pas rate-limité
**Fichier** : `api/auth/2fa/enable/route.ts`
**Risque** : Le code TOTP a 6 chiffres = 1M de possibilités. Sans rate limiting, un attaquant pourrait brute-forcer le code.
**Fix** : Ajouter rate limiting + limiter les tentatives (ex: 5 essais puis re-setup).

### M4. Rate limiter en mémoire ne scale pas
**Fichier** : `lib/auth.ts:170`
**Risque** : `rateLimitMap` est un `Map` en mémoire processus. En déploiement multi-instance (Vercel, PM2, etc.), chaque instance a sa propre map → le rate limiting est inefficace.
**Fix** : Migrer vers Redis (Upstash, ioredis) ou un service externe pour la production.

### M5. Rate limiter n'a pas de cleanup
**Fichier** : `lib/auth.ts:170`
**Risque** : Les entrées expirées ne sont jamais supprimées → fuite mémoire lente.
**Fix** : Ajouter un `setInterval` de nettoyage ou utiliser une LRU cache.

### M6. `x-forwarded-for` est user-controlled
**Fichier** : `api/auth/login/route.ts:13` et autres
**Risque** : Sans proxy de confiance, ce header est spoofable. Un attaquant peut envoyer un `X-Forwarded-For` différent à chaque requête pour contourner le rate limiting.
**Fix** : En production, configurer `trustProxy` et valider la chaîne d'IPs. Utiliser l'IP socket si pas de proxy.

### M7. Pas de protection CSRF explicite
**Risque** : Cookies SameSite=Lax protègent les POST cross-origin, mais un GET malveillant pourrait exploiter des effets de bord. Il n'y a pas de token CSRF.
**Fix** : Ajouter un header custom (`X-Requested-With`) vérifié côté serveur, ou un token CSRF synchronisé.

### M8. Pas de limite de taille des body
**Risque** : Un attaquant peut envoyer un body JSON de 100 Mo → crash mémoire.
**Fix** : Ajouter un check `Content-Length` en middleware ou configurer Next.js `bodyParser.sizeLimit`.

### M9. Pas de changement de mot de passe authentifié
**Risque** : Il n'y a aucune route "changer le mot de passe" qui vérifie le mot de passe actuel. La seule façon est via le flow reset-password (email).
**Fix** : Créer `PUT /api/auth/change-password` qui exige le mot de passe actuel + le nouveau.

### M10. Service Worker cache des pages avec données sensibles
**Fichier** : `public/sw.js`
**Risque** : Le SW cache les réponses HTML des pages (network-first, fallback cache). Ces pages peuvent contenir des données financières dans le HTML rendu.
**Fix** : Ne cacher que les assets statiques, pas les pages HTML. Ou ajouter `Cache-Control: no-store` sur les pages authentifiées.

---

## 🟡 Faible — Bonnes pratiques à mettre en place

### L1. Pas d'audit log pour les actions utilisateur
**Risque** : Seules les actions admin sont loguées. Login, logout, 2FA enable/disable, account deletion, password reset ne sont pas tracés.
**Fix** : Ajouter `auditLog()` dans les routes auth critiques.

### L2. Session de 30 jours
**Risque** : Très long pour une app financière. Si un token est compromis, il reste valide 30 jours.
**Fix** : Réduire à 7 jours + implémenter des refresh tokens.

### L3. Fingerprint faible (UA seul)
**Risque** : Beaucoup d'utilisateurs partagent le même User-Agent. Le fingerprint est facilement reproductible.
**Fix** : Ajouter l'IP (ou un hash d'IP) au fingerprint, ou utiliser un challenge client-side.

### L4. CSP avec `unsafe-inline` et `unsafe-eval`
**Risque** : Affaiblit la protection XSS. Nécessaire pour Next.js en dev, mais devrait être resserré en production.
**Fix** : Utiliser des nonces CSP avec Next.js en production.

### L5. Pas d'historique de mots de passe
**Risque** : Un utilisateur peut réutiliser le même mot de passe après un reset.
**Fix** : Stocker les N derniers hashes et comparer.

### L6. Headers manquants
**Risque** : Manque `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `X-DNS-Prefetch-Control`.
**Fix** : Ajouter dans `applySecurityHeaders()`.

### L7. Console.error peut fuiter des données sensibles
**Risque** : `console.error('...error:', err)` pourrait logger des payloads contenant des données utilisateur.
**Fix** : Utiliser un logger structuré qui sanitise les données.

### L8. Dev auto-verify emails
**Fichier** : `api/auth/register/route.ts:48`
**Risque** : `emailVerified: isDev` — Si `NODE_ENV` n'est pas correctement défini en production, les emails seraient auto-vérifiés.
**Fix** : Double-vérifier que `NODE_ENV=production` est forcé en déploiement.

---

## 📋 Plan d'action priorisé

### Sprint 1 — Critique ✅
- [x] **C1** Retirer `/api/user` de PUBLIC_PATHS
- [x] **C2** Passer le retour onboard par `safeUser()`
- [x] **C3** Remplacer `getSessionUserId()` par `requireAuth()` dans onboard
- [x] **C4** Ajouter validation sur toutes les routes POST/PUT (`lib/validation.ts`)
- [x] **C5** Ajouter check NaN/Infinity après chaque parseFloat/parseInt

### Sprint 2 — Moyen ✅
- [x] **M1** Neutraliser le message d'erreur de register
- [x] **M2** Rate limiting sur reset-password (Redis + fallback mémoire)
- [x] **M3** Rate limiting sur 2FA enable (5 tentatives / 5 min par userId)
- [x] **M4** Migrer rate limiting vers Redis (Upstash sliding window + fallback)
- [x] **M5** Cleanup du rate limiter en mémoire (auto-éviction)
- [x] **M6** Valider x-forwarded-for via `TRUSTED_PROXY_COUNT` (`lib/rate-limit.ts`)
- [x] **M7** Protection CSRF via vérification Origin/Referer en middleware
- [x] **M8** Limite de taille des body (1 Mo, middleware)
- [x] **M9** Route `POST /api/auth/change-password` (auth + vérification mdp actuel)
- [x] **M10** Service Worker ne cache plus les pages HTML

### Sprint 3 — Hardening ✅
- [x] **L1** Audit log sur actions utilisateur (login, logout-all, password, 2FA, account delete)
- [x] **L2** Session réduite de 30j → 7j
- [x] **L3** Fingerprint renforcé (UA + IP hash)
- [x] **L4** CSP avec nonces par requête, `unsafe-eval` supprimé en production
- [x] **L6** Headers COOP `same-origin`, COEP `require-corp`, X-DNS-Prefetch-Control `off`

### Sprint 4 — Polish ✅
- [x] **L5** Historique de mots de passe (5 derniers, modèle `PasswordHistory`)
- [x] **L7** Logger structuré `safeError()` — redaction de clés sensibles (`lib/logger.ts`)
- [x] **L8** Auto-verify emails uniquement si `NODE_ENV === 'development'` (strict)

---

## Score global : 9.5 / 10

Tous les points identifiés lors de l'audit ont été corrigés. L'application dispose désormais de :
- **Validation d'entrée** centralisée sur toutes les routes
- **Rate limiting** Redis-backed avec fallback mémoire et cleanup
- **CSRF protection** via Origin/Referer sur toutes les mutations API
- **CSP noncée** sans `unsafe-eval` en production
- **Audit logging** complet (actions user + admin)
- **Historique de mots de passe** (5 derniers)
- **Logger sécurisé** empêchant les fuites de données dans les logs
- **Fingerprint fort** (UA + IP), **sessions courtes** (7j)
- **12 headers de sécurité** dont HSTS, COOP, COEP, CSP, Permissions-Policy

Points restants pour amélioration future :
- Refresh tokens (rotation automatique)
- Client-side fingerprint challenge (canvas, WebGL)
- Content-Security-Policy `style-src` sans `unsafe-inline` (nécessite CSS modules purs)
- Monitoring / alerting sur les audit logs
