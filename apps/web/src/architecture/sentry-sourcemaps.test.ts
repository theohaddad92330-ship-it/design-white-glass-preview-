import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Garde S.5 (décision Louis 19/10/2026) : le plugin source maps Sentry ne
// s'active QUE avec SENTRY_AUTH_TOKEN, et quand il est actif les .map ne
// restent jamais dans le bundle servi.
vi.mock('@sentry/vite-plugin', () => ({
  sentryVitePlugin: (options: unknown) => ({ name: 'sentry-vite-plugin-stub', options }),
}))

import { sentrySourcemapsConfig } from '../../vite-plugins/sentry-sourcemaps'

type StubPlugin = { name: string; options: Record<string, unknown> }

describe('source maps Sentry web (S.2 / S.5)', () => {
  it('sans clé ni SHA : aucun plugin, aucune option de build, aucun define (build byte-identique)', async () => {
    const cfg = await sentrySourcemapsConfig({})
    expect(cfg.active).toBe(false)
    expect(cfg.plugins).toEqual([])
    expect(cfg.build).toEqual({})
    expect(cfg.define).toEqual({})
  })

  // #4618 — bellum-web remontait sans `release` : le SHA se pose même sans jeton d'upload (tag seul).
  it('sans clé mais avec le SHA Vercel : la release est posée, ni plugin ni maps', async () => {
    const cfg = await sentrySourcemapsConfig({ VERCEL_GIT_COMMIT_SHA: 'abc' })
    expect(cfg.active).toBe(false)
    expect(cfg.plugins).toEqual([])
    expect(cfg.build).toEqual({})
    expect(cfg.define).toEqual({ __SENTRY_RELEASE__: '"abc"' })
  })

  it('clé vide = absente', async () => {
    expect((await sentrySourcemapsConfig({ SENTRY_AUTH_TOKEN: '' })).active).toBe(false)
  })

  it('avec clé : maps hidden, release = SHA Vercel, maps supprimées après upload', async () => {
    const cfg = await sentrySourcemapsConfig({ SENTRY_AUTH_TOKEN: 'x', VERCEL_GIT_COMMIT_SHA: 'deadbeef' })
    expect(cfg.active).toBe(true)
    expect(cfg.build).toEqual({ sourcemap: 'hidden' })
    expect(cfg.define).toEqual({ __SENTRY_RELEASE__: '"deadbeef"' })
    const options = (cfg.plugins[0] as StubPlugin).options
    expect(options['release']).toEqual({ name: 'deadbeef' })
    expect(options['org']).toBe('bellumai')
    expect(options['url']).toBe('https://de.sentry.io')
    expect(options['sourcemaps']).toEqual({ filesToDeleteAfterUpload: ['./dist/**/*.map'] })
  })

  it('la config Vite ne câble le plugin que par ce module (pas de sourcemap en dur)', () => {
    const src = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8')
    expect(src).toContain('sentrySourcemapsConfig(process.env)')
    expect(src).not.toMatch(/sourcemap:\s*(true|'hidden'|"hidden")/)
    expect(src).not.toMatch(/sentryVitePlugin\(/)
  })
})
