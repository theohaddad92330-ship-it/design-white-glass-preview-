# Auth flow BellumAI

Ce document décrit le fonctionnement réel de l'authentification produit. La source d'auth est Supabase Auth, mais les clients passent par l'API NestJS pour garder une couche applicative stable, ajouter l'OTP email BellumAI, poser les cookies et enrichir la session avec l'état produit.

## Vue d'ensemble

| Couche        | Responsabilité                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `@bellum/web` | Formulaires login/signup/reset, stockage côté navigateur via cookies et appels API.             |
| `@bellum/api` | Contrôleurs `/auth`, validation DTO, orchestration Supabase, OTP, cookies et session lifecycle. |
| Supabase Auth | Création utilisateur, login password, refresh token, OAuth Google, suppression auth user.       |
| Redis         | Stockage temporaire des OTP et throttling via `OtpService`.                                     |
| Mailer        | Envoi OTP, reset password et welcome email via Mailpit en local ou Resend/SMTP en production.   |

## Endpoints API

| Endpoint                              | Auth requise                    | Rôle                                                                                       |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /auth/signup`                   | Non                             | Crée un utilisateur Supabase, envoie un OTP email si la vérification n'est pas bypassée.   |
| `POST /auth/verify-email-otp/:userId` | Non                             | Vérifie l'OTP Bellum, confirme l'email Supabase et ouvre une session.                      |
| `POST /auth/resend-email-otp/:userId` | Non                             | Renvoie un OTP email avec throttling.                                                      |
| `POST /auth/login`                    | Non                             | Login email/password via Supabase. Si l'email n'est pas confirmé, relance la vérification. |
| `POST /auth/refresh`                  | Cookie refresh ou body fallback | Rafraîchit la session Supabase.                                                            |
| `POST /auth/logout`                   | Oui                             | Révoque la session et efface le cookie refresh.                                            |
| `GET /auth/session`                   | Oui                             | Retourne l'utilisateur courant.                                                            |
| `GET /auth/session/state`             | Oui                             | Retourne les signaux lifecycle utilisés par le front.                                      |
| `POST /auth/reset-password`           | Non                             | Lance le parcours reset password.                                                          |
| `POST /auth/confirm-reset-password`   | Non                             | Confirme le reset et ouvre une session.                                                    |
| `POST /auth/request-otp`              | Non                             | Demande un OTP Supabase passwordless existant.                                             |
| `GET /auth/oauth/google`              | Non                             | Retourne l'URL OAuth Google.                                                               |
| `POST /auth/oauth/callback`           | Non                             | Échange les tokens OAuth et ouvre une session.                                             |
| `DELETE /auth/account`                | Oui                             | Supprime l'utilisateur Supabase et efface le refresh cookie.                               |

## Signup email/password

1. Le front appelle `POST /auth/signup` avec email, mot de passe, prénom et nom.
2. L'API vérifie si l'email existe déjà dans Supabase.
3. Si l'utilisateur existe et est confirmé, l'API renvoie `email_taken`.
4. Si l'utilisateur existe mais n'est pas confirmé, l'API renvoie vers le parcours de vérification et renvoie un OTP.
5. Si l'utilisateur n'existe pas, l'API crée l'utilisateur Supabase.
6. Si `BYPASS_EMAIL_VERIFICATION=true`, l'API confirme l'email côté Supabase, envoie le welcome email et tente de créer une session.
7. Sinon, l'API génère un OTP Bellum dans Redis, envoie l'email et renvoie `pending_email_verification`.
8. Le front appelle `POST /auth/verify-email-otp/:userId`.
9. L'API valide l'OTP, confirme l'email Supabase, envoie le welcome email et échange un magic link Supabase contre une session.

## Login et session

Le login password passe par Supabase Auth. Une réponse Supabase `email not confirmed` n'est pas traitée comme une impasse : l'API retrouve l'utilisateur, renvoie un nouvel OTP et retourne `pending_email_verification`.

La session retournée contient :

- `access_token`
- `refresh_token`
- `expires_at`
- `user.id`
- `user.email`
- `user.email_confirmed_at`
- `user.created_at`
- `user.roles`, issus de `user_metadata.roles` ou `['customer']` par défaut

Le refresh token est la source durable côté navigateur via cookie. Le body `refresh_token` reste accepté comme fallback de test et de scénarios explicites.

## Cookies

Les cookies sont posés/effacés par les interceptors API :

- `AttachRefreshCookieInterceptor`
- `ClearRefreshCookieInterceptor`

Les noms peuvent être pilotés par :

- `SESSION_COOKIE_PREFIX`
- `REFRESH_COOKIE_PREFIX`
- `LOGGED_IN_COOKIE_PREFIX`
- `LAST_USED_LOGIN_COOKIE_NAME`

## Session lifecycle

`GET /auth/session/state` agrège des signaux produit :

- première session dans une fenêtre de 10 minutes après création,
- présence d'au moins une analyse lancée,
- génération réussie du `profile_context`,
- phrase d'accueil personnalisée,
- affichage éventuel de l'accueil personnalisé.

Ce endpoint dépend de Supabase Auth, des comptes existants et du module `profile-context`.

## OAuth Google

Google OAuth est optionnel. En local il est désactivé par défaut via `GOOGLE_AUTH_ENABLED=false`.

Variables nécessaires si activé :

- `GOOGLE_AUTH_ENABLED=true`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Callback local Supabase : `http://localhost:54321/auth/v1/callback`.

## Reset password

Le reset password passe par :

1. `POST /auth/reset-password`
2. email de reset envoyé via le mailer
3. `POST /auth/confirm-reset-password`

La confirmation prend un `token_hash`, un nouveau mot de passe et une preuve d'expiration/signature.

## Sécurité et limites

- Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` au front.
- Les JWT Supabase demo du local ne doivent jamais être réutilisés en staging/prod.
- `BYPASS_EMAIL_VERIFICATION` peut servir en dev/E2E, jamais en production.
- La suppression de compte auth existe, mais l'export/purge RGPD complète des données applicatives reste à finaliser.
- Sentry est instrumenté dans le code, mais aucun compte/projet organisationnel n'est configuré actuellement.
