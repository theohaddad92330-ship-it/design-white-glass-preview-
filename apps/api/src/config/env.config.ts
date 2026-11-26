import { envSchema } from '@bellum/contracts'
import { TechnicalError } from '@bellum/errors'

export function envConfig() {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    throw new TechnicalError('Invalid environment configuration. Check your .env file.', {
      context: parsed.error.message,
    })
  }

  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseAnonKey: parsed.data.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    supabaseJwtSecret: parsed.data.SUPABASE_JWT_SECRET,
    postgresHost: parsed.data.POSTGRES_HOST,
    postgresPort: parsed.data.POSTGRES_PORT,
    postgresUser: parsed.data.POSTGRES_USER,
    postgresPassword: parsed.data.POSTGRES_PASSWORD,
    postgresDb: parsed.data.POSTGRES_DB,
    anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
    stripeSecretKey: parsed.data.STRIPE_SECRET_KEY,
    stripeWebhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
    smtpHost: parsed.data.SMTP_HOST,
    smtpPort: parsed.data.SMTP_PORT,
    smtpSecure: parsed.data.SMTP_SECURE,
    smtpUser: parsed.data.SMTP_USER,
    smtpPassword: parsed.data.SMTP_PASSWORD,
    smtpFrom: parsed.data.SMTP_FROM,
    mailpitHttpBaseUrl: parsed.data.MAILPIT_HTTP_BASE_URL,
    emailProvider: parsed.data.EMAIL_PROVIDER,
    resendApiKey: parsed.data.RESEND_API_KEY,
    resendFrom: parsed.data.RESEND_FROM,
    resendWebhookSecret: parsed.data.RESEND_WEBHOOK_SECRET,
    redisUrl: parsed.data.REDIS_URL,
    bypassEmailVerification: parsed.data.BYPASS_EMAIL_VERIFICATION,
    iaServiceUrl: parsed.data.IA_SERVICE_URL,
    dropcontactApiKey: parsed.data.DROPCONTACT_API_KEY,
    apiInternalUrl: parsed.data.API_INTERNAL_URL,
    apiPublicUrl: parsed.data.API_PUBLIC_URL,
    mcpPublicUrl: parsed.data.MCP_PUBLIC_URL,
    mcpOauthSigningKey: parsed.data.MCP_OAUTH_SIGNING_KEY,
    internalApiSecret: parsed.data.INTERNAL_API_SECRET,
    demoPublic: parsed.data.DEMO_PUBLIC,
    demoLinkToken: parsed.data.DEMO_LINK_TOKEN,
    demoPoolSize: parsed.data.DEMO_POOL_SIZE,
    chatDailyMessageLimit: parsed.data.CHAT_DAILY_MESSAGE_LIMIT,
    emailEstimateProbeTimeoutMs: parsed.data.EMAIL_ESTIMATE_PROBE_TIMEOUT_MS,
    chatQuotaExemptUserIds: parsed.data.CHAT_QUOTA_EXEMPT_USER_IDS,
    // Le seuil d'annonce « bientôt à court de crédits » (D5) — voir
    // `CREDIT_LOW_THRESHOLD_PERCENT` dans le schéma d'environnement.
    creditLowThresholdPercent: parsed.data.CREDIT_LOW_THRESHOLD_PERCENT,
    demoLeaseTtlMinutes: parsed.data.DEMO_LEASE_TTL_MINUTES,
    reflagSecretKey: parsed.data.REFLAG_SECRET_KEY,
    frontendUrl: parsed.data.FRONTEND_URL,
    // Console d'exploitation (`apps/dashboard-manager`). Jamais `VITE_*` : elle
    // serait lisible dans le bundle public. Voir `BACKOFFICE_URL` au schéma.
    backofficeUrl: parsed.data.BACKOFFICE_URL,
    // Le plafond réel d'un lien de réinitialisation — voir `SUPABASE_OTP_EXP_SECONDS`.
    supabaseOtpExpSeconds: parsed.data.SUPABASE_OTP_EXP_SECONDS,
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    sessionCookiePrefix: parsed.data.SESSION_COOKIE_PREFIX,
    refreshCookiePrefix: parsed.data.REFRESH_COOKIE_PREFIX,
    loggedInCookiePrefix: parsed.data.LOGGED_IN_COOKIE_PREFIX,
    lastUsedLoginCookieName: parsed.data.LAST_USED_LOGIN_COOKIE_NAME,
    cookieDomain: parsed.data.COOKIE_DOMAIN,
  }
}
