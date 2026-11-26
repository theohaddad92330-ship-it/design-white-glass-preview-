import { describe, expect, it } from 'vitest'
import { envSchema } from './env.js'

const VALID_BASE = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'sk',
  SUPABASE_JWT_SECRET: 'jwt',
  ANTHROPIC_API_KEY: 'ak',
  STRIPE_SECRET_KEY: 'stripe',
}

describe('envSchema', () => {
  it('parses a minimal valid env and applies defaults', () => {
    const env = envSchema.parse(VALID_BASE)
    expect(env.SUPABASE_URL).toBe('https://x.supabase.co')
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3000)
    expect(env.IA_SERVICE_URL).toBe('http://localhost:8000')
    expect(env.API_INTERNAL_URL).toBe('http://localhost:3000')
    expect(env.FRONTEND_URL).toBe('http://localhost:5173')
    expect(env.STRIPE_WEBHOOK_SECRET).toBe('')
    expect(env.REDIS_URL).toBe('')
    expect(env.SMTP_HOST).toBe('localhost')
    expect(env.SMTP_PORT).toBe(1025)
    expect(env.SMTP_SECURE).toBe(false)
    expect(env.MAILPIT_HTTP_BASE_URL).toBe('http://localhost:8025')
    expect(env.EMAIL_PROVIDER).toBeUndefined()
    expect(env.RESEND_API_KEY).toBe('')
    expect(env.RESEND_FROM).toBe('noreply@bellum.local')
  })

  it('coerces PORT from string to number', () => {
    const env = envSchema.parse({ ...VALID_BASE, PORT: '8080' })
    expect(env.PORT).toBe(8080)
  })

  it('rejects a non-URL SUPABASE_URL', () => {
    expect(() => envSchema.parse({ ...VALID_BASE, SUPABASE_URL: 'not-a-url' })).toThrow()
  })

  it('rejects a non-URL IA_SERVICE_URL when provided', () => {
    expect(() => envSchema.parse({ ...VALID_BASE, IA_SERVICE_URL: 'nope' })).toThrow()
  })

  it('accepts only allowed NODE_ENV values', () => {
    // Production requires a strong INTERNAL_API_SECRET (see below), so supply one.
    const strong = 'x'.repeat(32)
    expect(envSchema.parse({ ...VALID_BASE, NODE_ENV: 'production', INTERNAL_API_SECRET: strong }).NODE_ENV).toBe(
      'production',
    )
    expect(envSchema.parse({ ...VALID_BASE, NODE_ENV: 'test' }).NODE_ENV).toBe('test')
    expect(() => envSchema.parse({ ...VALID_BASE, NODE_ENV: 'staging' })).toThrow()
  })

  it('rejects empty required secrets', () => {
    expect(() => envSchema.parse({ ...VALID_BASE, ANTHROPIC_API_KEY: '' })).toThrow()
  })

  describe('MCP_OAUTH_SIGNING_KEY floor', () => {
    // Aligned on INTERNAL_API_SECRET's >= 32 production floor: this key falls
    // back to INTERNAL_API_SECRET when unset, so a weaker floor here would
    // have let an operator set an explicit-but-weak override that undercuts
    // the stronger secret it's meant to mirror.
    it('rejects a 16-31 char key (the old floor)', () => {
      expect(() => envSchema.parse({ ...VALID_BASE, MCP_OAUTH_SIGNING_KEY: 'x'.repeat(16) })).toThrow()
      expect(() => envSchema.parse({ ...VALID_BASE, MCP_OAUTH_SIGNING_KEY: 'x'.repeat(31) })).toThrow()
    })

    it('accepts a >= 32 char key', () => {
      const key = 'x'.repeat(32)
      expect(envSchema.parse({ ...VALID_BASE, MCP_OAUTH_SIGNING_KEY: key }).MCP_OAUTH_SIGNING_KEY).toBe(key)
    })

    it('stays optional (unset → falls back to INTERNAL_API_SECRET elsewhere, not validated here)', () => {
      expect(envSchema.parse({ ...VALID_BASE }).MCP_OAUTH_SIGNING_KEY).toBeUndefined()
    })
  })

  describe('INTERNAL_API_SECRET production hardening', () => {
    const strong = 'x'.repeat(32)

    it('rejects the dev default in production', () => {
      // Unset → falls back to the well-known dev placeholder → forbidden in prod.
      expect(() => envSchema.parse({ ...VALID_BASE, NODE_ENV: 'production' })).toThrow()
      expect(() =>
        envSchema.parse({
          ...VALID_BASE,
          NODE_ENV: 'production',
          INTERNAL_API_SECRET: 'dev-internal-secret-change-me',
        }),
      ).toThrow()
    })

    it('rejects a too-short secret in production', () => {
      expect(() =>
        envSchema.parse({ ...VALID_BASE, NODE_ENV: 'production', INTERNAL_API_SECRET: 'short-but-16chars' }),
      ).toThrow()
    })

    it('accepts a strong explicit secret in production', () => {
      expect(
        envSchema.parse({ ...VALID_BASE, NODE_ENV: 'production', INTERNAL_API_SECRET: strong }).INTERNAL_API_SECRET,
      ).toBe(strong)
    })

    it('does not enforce the rule outside production (dev keeps the default)', () => {
      expect(envSchema.parse({ ...VALID_BASE }).INTERNAL_API_SECRET).toBe('dev-internal-secret-change-me')
    })
  })

  // #4016 L7 — décision Louis 11/10/2026 : le PLAN fait foi. `CHAT_DAILY_MESSAGE_LIMIT`
  // devient un plafond de sécurité OPTIONNEL : sans clé, aucune bride de plus
  // (c'était un défaut de 50 qui bridait Growth à 50 en silence).
  describe('CHAT_DAILY_MESSAGE_LIMIT — plafond de sécurité optionnel', () => {
    it('absent : aucune valeur — plus de défaut 50 qui bride le plan', () => {
      expect(envSchema.parse(VALID_BASE).CHAT_DAILY_MESSAGE_LIMIT).toBeUndefined()
    })

    it('vide : comme absent — jamais lu « 0 », qui couperait toute la borne', () => {
      expect(envSchema.parse({ ...VALID_BASE, CHAT_DAILY_MESSAGE_LIMIT: '' }).CHAT_DAILY_MESSAGE_LIMIT).toBeUndefined()
      expect(
        envSchema.parse({ ...VALID_BASE, CHAT_DAILY_MESSAGE_LIMIT: '  ' }).CHAT_DAILY_MESSAGE_LIMIT,
      ).toBeUndefined()
    })

    it('posé : la valeur, `0` compris (l’interrupteur de l’opérateur)', () => {
      expect(envSchema.parse({ ...VALID_BASE, CHAT_DAILY_MESSAGE_LIMIT: '80' }).CHAT_DAILY_MESSAGE_LIMIT).toBe(80)
      expect(envSchema.parse({ ...VALID_BASE, CHAT_DAILY_MESSAGE_LIMIT: '0' }).CHAT_DAILY_MESSAGE_LIMIT).toBe(0)
    })

    it('illisible : refusé au démarrage, jamais une borne devinée', () => {
      expect(() => envSchema.parse({ ...VALID_BASE, CHAT_DAILY_MESSAGE_LIMIT: 'beaucoup' })).toThrow()
      expect(() => envSchema.parse({ ...VALID_BASE, CHAT_DAILY_MESSAGE_LIMIT: '-1' })).toThrow()
    })
  })
})
