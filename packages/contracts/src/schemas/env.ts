import { z } from 'zod'

/** Well-known dev placeholder — forbidden in production (see the superRefine below). */
const DEV_INTERNAL_SECRET = 'dev-internal-secret-change-me'

export const envSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_JWT_SECRET: z.string().min(1),
    // Direct Postgres connection (TypeORM). Defaults match tools/docker-compose.yml.
    POSTGRES_HOST: z.string().default('localhost'),
    POSTGRES_PORT: z.coerce.number().default(5432),
    POSTGRES_USER: z.string().default('postgres'),
    POSTGRES_PASSWORD: z.string().default('postgres'),
    POSTGRES_DB: z.string().default('postgres'),
    ANTHROPIC_API_KEY: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().default(''),
    // Feature flags (Reflag). Empty = SDK not started, every flag reads false.
    REFLAG_SECRET_KEY: z.string().default(''),

    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    SMTP_FROM: z.string().email().default('noreply@bellum.local'),
    MAILPIT_HTTP_BASE_URL: z.string().url().default('http://localhost:8025'),
    // No default on purpose: when unset, the mailer sends via Resend in
    // production and Mailpit everywhere else (see resolveEmailTransportMode).
    // A 'mailpit' default would silently route prod mail to localhost:8025.
    EMAIL_PROVIDER: z.enum(['mailpit', 'resend']).optional(),
    RESEND_API_KEY: z.string().default(''),
    RESEND_FROM: z.string().email().default('noreply@bellum.local'),
    // #2733 — signe les événements du webhook Resend (`email.bounced`…).
    // Absente = le webhook REFUSE tout (503), jamais un événement accepté
    // sans preuve qu'il vient bien de Resend (même posture que
    // STRIPE_WEBHOOK_SECRET juste au-dessus).
    RESEND_WEBHOOK_SECRET: z.string().default(''),
    REDIS_URL: z.string().default(''),
    /**
     * Skip the email-OTP verification flow on signup (and short-circuit
     * /auth/verify-email-otp to success). Local dev + E2E only — never set
     * to "true" in production.
     */
    BYPASS_EMAIL_VERIFICATION: z.enum(['true', 'false']).default('false'),
    IA_SERVICE_URL: z.string().url().default('http://localhost:8000'),
    /**
     * Optional Dropcontact API key (RGPD-safe contact enrichment — algorithmic,
     * no stored pre-scraped DB). Unset → the Dropcontact enrichment fallback is a
     * strict no-op (never called, zero network); Apollo stays the sole/default
     * enrichment provider, behaviour unchanged.
     */
    DROPCONTACT_API_KEY: z.string().optional(),
    /**
     * URL the IA service uses to call back into the API (sub-phase progress
     * callbacks). On Railway this should point at the API service via internal
     * DNS (e.g. `http://bellum-api.railway.internal:3000`); locally it's just
     * the API's own URL.
     */
    API_INTERNAL_URL: z.string().url().default('http://localhost:3000'),
    /**
     * Single shared secret between API and IA, sent as `X-Internal-Secret`
     * on every M2M call. Same value in both services.
     */
    INTERNAL_API_SECRET: z.string().min(16).default(DEV_INTERNAL_SECRET),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    /**
     * Adresse publique de la console d'exploitation (`apps/dashboard-manager`),
     * une application SÉPARÉE de l'application cliente.
     *
     * ⚠️ Volontairement SANS préfixe `VITE_` — et c'est tout l'objet de la
     * décision de Louis du 28/08/2026. Une variable `VITE_*` est inlinée dans le
     * bundle public : n'importe quel visiteur qui ouvre les sources y lirait
     * l'adresse d'une console d'opérateur. L'API la rend, au seul porteur du
     * rôle `backoffice`, sur `GET /backoffice/address`.
     *
     * Absente = no-op STRICT : la route rend `{ url: null }`, l'écran garde son
     * paragraphe et n'affiche aucun lien. Jamais d'erreur, jamais d'adresse
     * devinée — un défaut de configuration ne doit pas envoyer un opérateur sur
     * une URL inventée. L'entrée de navigation, elle, reste gouvernée par le
     * RÔLE : elle ne disparaît pas le jour d'un déploiement mal configuré.
     */
    BACKOFFICE_URL: z.string().url().optional(),
    /**
     * L'expiration RÉELLE d'un jeton de récupération, telle qu'elle est réglée
     * dans le projet Supabase (Authentication › Email › « Email OTP
     * Expiration »). En SECONDES.
     *
     * ⚠️ Elle plafonne la durée de vie d'un lien de réinitialisation généré
     * depuis le back-office. Sans elle, on ne devine AUCUN plafond et la durée
     * demandée passe telle quelle — ce qui est le bon repli : deviner une limite
     * raccourcirait des liens sans raison sur un projet bien configuré. Mais
     * pour porter 48 heures pour de bon, il faut la relever chez Supabase ET la
     * déclarer ici, sinon la personne reçoit un lien que Supabase refusera.
     */
    SUPABASE_OTP_EXP_SECONDS: z.coerce.number().int().positive().optional(),
    // --- Shared demo link (mode démo) ---
    // `true` → `<FRONTEND_URL>/demo` works with NO key in the URL: the link is
    // open, which is the point (a prospect receives one plain URL). What makes
    // that acceptable is not secrecy but what sits at the end of it — fictional
    // dossiers, no IA call, no credit, no provider contacted — and the space is
    // wiped between visitors. Unset/false → the link only opens with
    // DEMO_LINK_TOKEN below.
    // `z.enum` et non `z.coerce.boolean()` : ce dernier rend `true` pour la
    // chaîne « false » (toute chaîne non vide est truthy) — un opérateur qui
    // écrirait `DEMO_PUBLIC=false` pour FERMER le lien l'aurait ouvert.
    DEMO_PUBLIC: z.enum(['true', 'false']).default('false'),
    // Optional hardening: with no DEMO_PUBLIC, the demo URL must carry this
    // secret (`/demo?t=<token>`) — for an environment where even the demo
    // should not be reachable by a stranger. Long (>= 32 chars) because the
    // token IS the credential. Neither variable set → the feature is a strict
    // no-op: POST /demo/session refuses and no session is ever minted without
    // a password.
    DEMO_LINK_TOKEN: z.string().min(32).optional(),
    // Nombre de SALLES de démo indépendantes derrière le lien partagé. Plusieurs
    // prospects peuvent donc être en démo EN MÊME TEMPS sans se marcher dessus :
    // chacun loue une salle (workspace + utilisateur dédiés), et la remise à neuf
    // d'une salle n'arrive que lorsqu'elle est libre. Les salles sont créées à la
    // demande — un environnement qui ne voit jamais deux visiteurs simultanés n'en
    // aura jamais qu'une. `1` reproduit exactement l'ancien comportement (espace
    // unique, purgé à chaque nouveau visiteur).
    DEMO_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(8),
    // Plafond quotidien du copilote, PAR UTILISATEUR (décision Louis 31/07 —
    // « gratuit mais borné »). Le copilote ne débite aucun crédit alors que chaque
    // message est un appel Claude : c'est le poste le plus lourd de la facture, et
    // aucun compteur ne le voyait. Borner l'usage d'un siège plutôt que rendre
    // payante la fonction qu'on veut justement voir utilisée. `0` = aucune borne.
    // #4016 L4.1 (décision Louis 11/10/2026) — LE seul réglage de l'e-mail
    // estimé : le budget TOTAL (MX + SMTP) de la vérification d'une adresse
    // déduite du motif de l'entreprise. Aucun crédit, aucun fournisseur payant ;
    // la latence ajoutée à un enrichissement sans e-mail est bornée par ce
    // nombre. `0` = sonde éteinte, donc AUCUNE adresse estimée n'est écrite
    // (invérifiable ⇒ non affichée). Voir `agent_docs/env-reference.md`.
    EMAIL_ESTIMATE_PROBE_TIMEOUT_MS: z.coerce.number().int().min(0).max(15_000).default(4000),
    // ⚠️ #4016 L7 — décision Louis 11/10/2026 : le PLAN fait foi
    // (`SHIPPED_PLAN_GRID.chatDailyMessageLimit`). Cette variable n'est plus
    // qu'un plafond de SÉCURITÉ OPTIONNEL de l'opérateur : absente (ou vide) =
    // aucune bride de plus que le plan. L'ancien défaut 50 bridait Growth (100)
    // à 50 en silence. Vide ne vaut JAMAIS `0` (qui couperait toute la borne).
    CHAT_DAILY_MESSAGE_LIMIT: z.preprocess(
      value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.coerce.number().int().min(0).max(10_000).optional(),
    ),
    // Exemption OPÉRATEUR du plafond du copilote (Louis 29/09/2026) : ids
    // d'utilisateurs séparés par des virgules — le compte de recette, jamais un
    // client. Absent = personne n'est exempté (no-op strict). Le plafond d'un
    // PLAN ne change pas : c'est un tarif, pas un réglage d'exploitation.
    CHAT_QUOTA_EXEMPT_USER_IDS: z.string().optional().default(''),
    // Part du quota du cycle CONSOMMÉE à partir de laquelle on prévient (D5,
    // Louis 28/08 — « livrer l'annonce AVANT le mur »). Un espace tombé à zéro
    // était arrêté sans qu'on le lui ait dit : le mur du 15 du mois est un
    // risque de rétention, pas un détail d'ergonomie.
    //
    // 80 = on prévient dès que 80 % des crédits du cycle sont dépensés, donc
    // tant qu'il en reste 20 % pour finir la semaine. Le RÉGLAGE de ce chiffre
    // attend la mesure de consommation réelle ; l'annonce, elle, ne l'attend
    // pas. Une valeur absente ou illisible retombe sur 80 — jamais une erreur
    // au démarrage : un avertissement mal réglé vaut mieux qu'une API morte.
    //
    // ⚠ C'est le SEUL endroit où ce seuil existe (GA-26). Le web ne le recalcule
    // pas : il lit `credits_low` dans la réponse de `GET /credits`.
    CREDIT_LOW_THRESHOLD_PERCENT: z.coerce.number().int().min(1).max(100).default(80),
    // Durée du bail d'une salle. Au-delà, la salle est considérée libre : elle est
    // purgée puis relouée. C'est donc la durée maximale d'une démo tranquille
    // quand le pool est saturé — pas une déconnexion (la session reste valide).
    DEMO_LEASE_TTL_MINUTES: z.coerce.number().int().min(1).max(720).default(30),
    // --- MCP (Model Context Protocol) remote server + OAuth 2.1 AS ---
    // Public URL of THIS API. Used as the OAuth `issuer` and the
    // `authorization_servers` entry advertised to MCP clients. Must equal the
    // `iss` claim on issued access tokens. Defaults to the local API URL.
    API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    // Public URL of the MCP resource server (apps/mcp). Also the OAuth
    // `resource`/audience the access token is bound to (RFC 8707). Unset →
    // the /settings MCP screen shows "bientôt disponible" and /oauth/register
    // refuses: the whole MCP feature is a no-op (env-gated).
    MCP_PUBLIC_URL: z.string().url().optional(),
    // HS256 signing key for MCP OAuth access tokens. Falls back to
    // INTERNAL_API_SECRET when unset (mirrors the CRM token-key ladder).
    MCP_OAUTH_SIGNING_KEY: z.string().min(32).optional(),
    // --- Google Workspace integration (Calendar + Gmail + Drive → RAG) ---
    // Optional, env-gated: unset → /google/* report "bientôt disponible" and make
    // ZERO network calls (mirrors HubSpot / Salesforce). Register an OAuth 2.0
    // client (console.cloud.google.com) and enable the Calendar/Gmail/Drive APIs.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // Must equal <API_PUBLIC_URL>/google/callback AND the client's authorized redirect URI.
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
    // Space-separated; defaults to calendar.events + gmail.send + drive.readonly.
    GOOGLE_SCOPES: z.string().optional(),
    // --- Notion integration (optional — ingest pages/DBs into the RAG) ---
    // Public Notion integration OAuth credentials. Unset → the Notion feature is
    // a no-op: /notion/* report "not configured", the settings card shows
    // "bientôt disponible", and ZERO network calls are made. Tokens are stored
    // AES-256-GCM encrypted (reuses the CRM token crypto). Read directly from
    // process.env by `notion-config.ts` (like HubSpot/Salesforce); declared here
    // for documentation + format validation only.
    NOTION_CLIENT_ID: z.string().optional(),
    NOTION_CLIENT_SECRET: z.string().optional(),
    // Must equal <API_PUBLIC_URL>/notion/callback and match a redirect URI
    // declared on the Notion integration.
    NOTION_REDIRECT_URI: z.string().url().optional(),
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    // Cookie naming. We follow Linear's convention `prefix:{userId}` for
    // user-scoped cookies — this lets multiple sessions coexist on the same
    // domain without collisions and makes per-account revocation trivial.
    // - `session:{userId}` carries the short-lived access JWT (Path=/)
    // - `uploadsSig:{userId}` carries the long-lived refresh JWT (Path=/ depuis le
    //   03/11/2026 : sur `/auth/refresh` il ne suivait pas le repli d'origine
    //   `/api/*`, et déconnectait à chaque rechargement derrière une passerelle)
    // - `loggedIn:{userId}` is a JS-readable presence flag
    // - `lastUsedLogin` is device-scoped so the login screen can preselect
    SESSION_COOKIE_PREFIX: z.string().default('session'),
    REFRESH_COOKIE_PREFIX: z.string().default('uploadsSig'),
    LOGGED_IN_COOKIE_PREFIX: z.string().default('loggedIn'),
    LAST_USED_LOGIN_COOKIE_NAME: z.string().default('lastUsedLogin'),
    // Cookie Domain attribute (e.g. `.bellum-ai.com`) so the app + API on
    // sibling subdomains share the auth cookies. Empty = host-only (dev).
    // Setting this in prod (with the API on api.bellum-ai.com) is the real fix
    // for the cross-site hard-reload logout: it makes the `loggedIn:` sentinel
    // same-site and readable by the SPA again. See refresh-cookie.interceptor.
    COOKIE_DOMAIN: z.string().default(''),
    // --- Microsoft 365 / Outlook (Microsoft Graph — Mail + Calendar) ---
    // Optional integration, env-gated exactly like HubSpot/Salesforce: without
    // the three required vars (id/secret/redirect) the feature is a no-op and
    // makes ZERO network calls. Redirect URI must equal
    // <API_PUBLIC_URL>/microsoft/callback. Tenant defaults to `common`; scopes
    // default to `offline_access Mail.Send Calendars.ReadWrite User.Read`.
    // Read at runtime via readMicrosoftConfig() — declared here only to document
    // the surface (all optional so an unset env still parses).
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_REDIRECT_URI: z.string().url().optional(),
    MICROSOFT_TENANT: z.string().optional(),
    MICROSOFT_SCOPES: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // In production the internal M2M secret must NOT fall back to the well-known
    // dev default (it gates /internal/admin/* self-assign-plan + the IA service),
    // and must be strong. This also covers MCP_OAUTH_SIGNING_KEY, which derives
    // from INTERNAL_API_SECRET when unset. Fail-fast at boot rather than run insecure.
    if (env.NODE_ENV === 'production') {
      if (env.INTERNAL_API_SECRET === DEV_INTERNAL_SECRET || env.INTERNAL_API_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INTERNAL_API_SECRET'],
          message:
            'INTERNAL_API_SECRET must be an explicit strong value (>= 32 chars) in production; ' +
            'the dev default is forbidden.',
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>
