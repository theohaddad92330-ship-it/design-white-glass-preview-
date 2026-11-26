import { describe, expect, it } from 'vitest'

import type { SkippedToken } from '../extract/types'
import { createMemoryLog } from './fake-figma'
import { logSkippedTokens } from './skipped-log'

/**
 * `code.ts:60` journalisait TOUT `tokens.skipped` en WARN — y compris une
 * exclusion VOULUE (`--bellum-mobile-nav-height`, qui dépend du viewport).
 * `intended: true` distingue les deux : une vraie anomalie reste un WARN,
 * une exclusion voulue passe en INFO. La planche « Non importés » de
 * `foundations.ts`, elle, continue de les lister TOUTES avec leur raison.
 */
describe('logSkippedTokens — voulu va en info, le reste reste un WARN', () => {
  const make = (over: Partial<SkippedToken>): SkippedToken => ({
    cssVar: '--x',
    source: 'tokens.css:1',
    reason: 'raison',
    ...over,
  })

  it('une exclusion voulue (`intended: true`) est journalisée en info', () => {
    const log = createMemoryLog()
    logSkippedTokens([make({ cssVar: '--bellum-mobile-nav-height', intended: true })], log)
    expect(log.lines).toEqual([
      { level: 'info', text: expect.stringContaining('--bellum-mobile-nav-height') as unknown as string },
    ])
  })

  it('une vraie anomalie (illisible ou absente, `intended` omis) reste un WARN', () => {
    const log = createMemoryLog()
    logSkippedTokens([make({ cssVar: '--border-subtle' })], log)
    expect(log.lines).toEqual([
      { level: 'warn', text: expect.stringContaining('--border-subtle') as unknown as string },
    ])
  })

  it('`intended: false` explicite reste un WARN, comme son absence', () => {
    const log = createMemoryLog()
    logSkippedTokens([make({ cssVar: '--y', intended: false })], log)
    expect(log.lines[0]?.level).toBe('warn')
  })

  it('le texte journalisé porte la variable, la source et la raison — comme la planche « Non importés »', () => {
    const log = createMemoryLog()
    logSkippedTokens([make({ cssVar: '--z', source: 'tokens.css:42', reason: 'valeur illisible' })], log)
    expect(log.lines[0]?.text).toBe('Non importé : --z (tokens.css:42) — valeur illisible')
  })
})
