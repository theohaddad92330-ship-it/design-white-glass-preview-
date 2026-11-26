import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv } from './env.js'

const TOUCHED_KEYS = ['NODE_ENV', 'INTERNAL_API_SECRET'] as const
const ORIGINAL: Record<string, string | undefined> = {}

function resetEnv() {
  for (const key of TOUCHED_KEYS) {
    if (ORIGINAL[key] === undefined) delete process.env[key]
    else process.env[key] = ORIGINAL[key]
  }
}

describe('loadEnv', () => {
  beforeEach(() => {
    for (const key of TOUCHED_KEYS) ORIGINAL[key] = process.env[key]
  })
  afterEach(resetEnv)

  it('parses defaults in development, keeping the dev INTERNAL_API_SECRET placeholder', () => {
    process.env['NODE_ENV'] = 'development'
    const env = loadEnv()
    expect(env.INTERNAL_API_SECRET).toBe('dev-internal-secret-change-me')
  })

  it('parses defaults in test, keeping the dev INTERNAL_API_SECRET placeholder', () => {
    process.env['NODE_ENV'] = 'test'
    const env = loadEnv()
    expect(env.INTERNAL_API_SECRET).toBe('dev-internal-secret-change-me')
  })

  describe('production hardening — mirrors packages/contracts/src/schemas/env.ts', () => {
    it('⚠️ épingle le défaut : refuse de démarrer en production sur le défaut dev', () => {
      process.env['NODE_ENV'] = 'production'
      delete process.env['INTERNAL_API_SECRET']
      // Avant le correctif, loadEnv() ne faisait qu'un safeParse SANS règle de
      // production : ceci passait silencieusement avec le secret par défaut.
      expect(() => loadEnv()).toThrow()
    })

    it('refuse un secret explicite trop court (< 32) en production', () => {
      process.env['NODE_ENV'] = 'production'
      process.env['INTERNAL_API_SECRET'] = 'short-but-16-chars'
      expect(() => loadEnv()).toThrow()
    })

    it('accepte un secret fort explicite en production', () => {
      process.env['NODE_ENV'] = 'production'
      const strong = 'x'.repeat(32)
      process.env['INTERNAL_API_SECRET'] = strong
      expect(loadEnv().INTERNAL_API_SECRET).toBe(strong)
    })

    it("n'impose rien hors production (dev garde le défaut, byte-identique)", () => {
      process.env['NODE_ENV'] = 'development'
      delete process.env['INTERNAL_API_SECRET']
      expect(loadEnv().INTERNAL_API_SECRET).toBe('dev-internal-secret-change-me')
    })
  })
})
