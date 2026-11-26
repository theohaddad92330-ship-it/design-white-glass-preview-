import { z } from 'zod'

// Shared by the API (Redis TTL), the email template, and the front so the
// three never drift.
export const OTP_CODE_EXPIRATION_MINUTES = 10

/**
 * Le message d'un champ ABSENT seulement (l'ancien `required_error` de zod 3,
 * supprimé en zod 4) : une valeur du mauvais type garde le message par défaut
 * de zod, comme avant. `error` retourne `undefined` pour passer la main.
 */
const requiredMessage = (message: string) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? message : undefined),
})

/**
 * L'adresse e-mail telle qu'elle doit ARRIVER au serveur, quelle que soit la
 * façon dont elle a été saisie.
 *
 * `trim` puis `toLowerCase` avant la validation, et dans cet ordre : sans le
 * `trim`, l'espace ajouté par un remplissage automatique ou une copie depuis un
 * client de messagerie fait échouer `.email()` — l'utilisateur voit « adresse
 * invalide » sur une adresse qui est la sienne, et conclut que la connexion
 * « marche une fois sur deux ». Le `toLowerCase` couvre la majuscule que posent
 * les claviers mobiles en début de champ.
 *
 * Les schémas de prénom et de nom `trim` depuis toujours ; l'oubli portait
 * uniquement sur l'e-mail, c'est-à-dire sur le seul champ qui sert de clé.
 */
const authEmail = () =>
  z
    .string(requiredMessage('Veuillez saisir votre email.'))
    .transform(value => value.trim().toLowerCase())
    .pipe(z.string().min(1, 'Veuillez saisir votre email.').email('Veuillez saisir une adresse email valide.'))

export const loginSchema = z.object({
  email: authEmail(),
  password: z
    .string(requiredMessage('Veuillez saisir votre mot de passe.'))
    .min(1, 'Veuillez saisir votre mot de passe.'),
})

export const signupSchema = z.object({
  email: authEmail(),
  password: z
    .string(requiredMessage('Veuillez saisir votre mot de passe.'))
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
  first_name: z
    .string(requiredMessage('Veuillez saisir votre prénom.'))
    .trim()
    .min(1, 'Veuillez saisir votre prénom.')
    .max(60, 'Le prénom est limité à 60 caractères.'),
  last_name: z
    .string(requiredMessage('Veuillez saisir votre nom.'))
    .trim()
    .min(1, 'Veuillez saisir votre nom.')
    .max(60, 'Le nom est limité à 60 caractères.'),
})

export const refreshSchema = z.object({
  /** Optional — primary path is the HttpOnly `bellum_refresh` cookie set
   *  on login. Body fallback is kept for explicit refresh flows (tests,
   *  scripts) but not required for the normal browser session. */
  refresh_token: z.string().min(1).optional(),
})

export const resetPasswordSchema = z.object({
  email: authEmail(),
})

export const confirmResetPasswordSchema = z.object({
  token_hash: z.string().min(1),
  expires_at: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  password: z
    .string(requiredMessage('Veuillez saisir votre nouveau mot de passe.'))
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
})

export const oauthCallbackSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
})

export const verifyEmailOtpSchema = z.object({
  code: z
    .string(requiredMessage('Veuillez saisir le code reçu par email.'))
    // Permissive case — the API uppercases before comparing.
    .regex(/^[A-Za-z0-9]{6}$/, 'Le code doit contenir 6 caractères (lettres ou chiffres).'),
})

// /resend-email-otp/:userId — body intentionally empty. Kept as a schema so the
// front and the API share a single source of truth for the wire shape.
export const resendEmailOtpSchema = z.object({})

// Connexion sans mot de passe (« recevoir un code par email »).
//
// Même code, même e-mail et même durée de vie que la vérification d'inscription
// au-dessus : les deux passent par NOTRE service OTP (6 caractères en Redis,
// envoyés par notre propre gabarit). Auparavant celui-ci déléguait à Supabase,
// dont le gabarit « Magic Link » envoie un LIEN : l'écran demandait six
// caractères pendant que la boîte de réception recevait un bouton à cliquer.
// /auth/request-otp envoie le code, /auth/verify-otp l'échange contre une
// session (même cookie qu'une connexion par mot de passe).
export const requestOtpSchema = z.object({
  email: authEmail(),
})

export const verifyOtpSchema = z.object({
  email: authEmail(),
  // Notre alphabet OTP exclut les caractères confondables (I, L, O, 0, 1) mais
  // contient des LETTRES : n'accepter que des chiffres rendait le code
  // insaisissable dès qu'il en contenait une — c'est-à-dire presque toujours.
  code: z
    .string(requiredMessage('Veuillez saisir le code reçu par email.'))
    // Permissif sur la casse — l'API met en majuscules avant de comparer.
    .regex(/^[A-Za-z0-9]{6}$/, 'Le code doit contenir 6 caractères (lettres ou chiffres).'),
})

export const sessionUserSchema = z.object({
  id: z.string().guid(),
  email: z.string().email(),
  email_confirmed_at: z.string().nullable().optional(),
  created_at: z.string(),
  roles: z.array(z.string()).default(['customer']),
})

export const sessionResponseSchema = z.object({
  access_token: z.string(),
  /** Optional in the browser flow — the API now sets the refresh token as
   *  an HttpOnly cookie so it never reaches JS. Tests and explicit-refresh
   *  flows can still receive it in the body. */
  refresh_token: z.string().optional(),
  expires_at: z.number().nullable(),
  user: sessionUserSchema,
})

// signup/login both return 200 with a discriminator; a pending OTP step is a
// normal branch, not an error. Real errors (email taken, bad credentials) → 4xx.
export const authOutcomeSchema = z.union([
  z.object({
    status: z.literal('authenticated'),
    session: sessionResponseSchema,
  }),
  z.object({
    status: z.literal('pending_email_verification'),
    // Path-param handle for /verify-email-otp + /resend-email-otp; email is for
    // display only.
    user_id: z.string().guid(),
    email: z.string().email(),
  }),
  // Password OK, but the account has TOTP 2FA enabled: no session is issued
  // here. The front collects a 6-digit code and finishes via
  // POST /auth/2fa/challenge with `mfaToken` — a short-lived signed token that
  // binds the userId (never carries the session tokens).
  z.object({
    status: z.literal('mfa_required'),
    mfaRequired: z.literal(true),
    mfaToken: z.string().min(1),
  }),
])

// Back-compat aliases so existing imports keep working.
export const signupResponseSchema = authOutcomeSchema
export const loginResponseSchema = authOutcomeSchema

export type Login = z.infer<typeof loginSchema>
export type Signup = z.infer<typeof signupSchema>
export type RefreshToken = z.infer<typeof refreshSchema>
export type ResetPassword = z.infer<typeof resetPasswordSchema>
export type ConfirmResetPassword = z.infer<typeof confirmResetPasswordSchema>
export type OauthCallback = z.infer<typeof oauthCallbackSchema>
export type VerifyEmailOtp = z.infer<typeof verifyEmailOtpSchema>
export type ResendEmailOtp = z.infer<typeof resendEmailOtpSchema>
export type RequestOtp = z.infer<typeof requestOtpSchema>
export type VerifyOtp = z.infer<typeof verifyOtpSchema>
export type SessionUser = z.infer<typeof sessionUserSchema>
export type SessionResponse = z.infer<typeof sessionResponseSchema>

/**
 * Nombre d'appareils sur lesquels une session tient à la fois (anti partage de
 * mot de passe, f24489c61). Au-delà, l'appareil vu le moins récemment est
 * révoqué à la connexion ou au refresh d'un autre.
 *
 * R15-7 — décision de Louis du 15/09/2026 : CINQ. À deux, le Mac en veille la
 * nuit sautait dès la première connexion du matin sur le téléphone. Vit ici, et
 * nulle part ailleurs (GA-26) : l'API l'applique, l'écran le cite.
 */
export const MAX_ACTIVE_DEVICES = 5

/**
 * Le code machine de la 401 d'un appareil RÉVOQUÉ (plafond d'appareils, ou
 * « déconnecter cet appareil » depuis un autre). Le client la reconnaît à ce
 * code, jamais à la phrase : aucun refresh ne lève une révocation, et l'écran
 * doit proposer de se reconnecter au lieu de rester une coquille vide (R15-7).
 */
export const SESSION_REVOKED_CODE = 'session_revoked'

/** One active device in the "Sessions actives" list (anti password-sharing). */
export const activeSessionSchema = z.object({
  id: z.string(),
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  last_seen_at: z.string(),
  created_at: z.string(),
  /** Whether this row is the device making the request. */
  current: z.boolean(),
})
export type ActiveSession = z.infer<typeof activeSessionSchema>
export type AuthOutcome = z.infer<typeof authOutcomeSchema>
export type SignupResponse = AuthOutcome
export type LoginResponse = AuthOutcome

/** Lifecycle signals computed server-side from auth.users + profile_context +
 *  accounts. The client uses these to drive welcome/greeting branches without
 *  duplicating the logic or leaking raw auth timestamps. */
export const sessionLifecycleStateSchema = z.object({
  is_first_session: z.boolean(),
  has_launched_analysis: z.boolean(),
  has_generated_profile: z.boolean(),
  welcome_phrase: z.string().nullable(),
  should_show_welcome: z.boolean(),
})
export type SessionLifecycleState = z.infer<typeof sessionLifecycleStateSchema>

/* ------------------------------------------------------------------ */
/*  TOTP two-factor authentication (RFC 6238)                          */
/* ------------------------------------------------------------------ */

/** A TOTP code is exactly 6 digits (Google Authenticator / 1Password / …). */
export const mfaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres.'),
})
export type MfaCode = z.infer<typeof mfaCodeSchema>

/** Second step of a 2FA login: prove the pending `mfaToken` + a fresh code. */
export const mfaChallengeSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres.'),
})
export type MfaChallenge = z.infer<typeof mfaChallengeSchema>

/** GET /auth/2fa/status — whether the caller has an active TOTP factor. */
export const mfaStatusSchema = z.object({
  enabled: z.boolean(),
})
export type MfaStatus = z.infer<typeof mfaStatusSchema>

/** POST /auth/2fa/enroll — everything the front needs to display the QR code
 *  and the manual key. The factor stays disabled until a code is verified. */
export const mfaEnrollResponseSchema = z.object({
  /** `otpauth://totp/...` URI encoded in the QR code. */
  otpauthUrl: z.string().min(1),
  /** PNG data URL (`data:image/png;base64,…`) of the QR code. */
  qrDataUrl: z.string().min(1),
  /** Base32 secret, shown for manual entry when a camera isn't available. */
  secret: z.string().min(1),
})
export type MfaEnrollResponse = z.infer<typeof mfaEnrollResponseSchema>
