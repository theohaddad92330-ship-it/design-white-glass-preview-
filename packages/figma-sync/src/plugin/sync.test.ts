import { describe, expect, it } from 'vitest'

import tokensJson from '../../generated/tokens.json'
import type { TokenSet } from '../extract/types'
import { createFakeFigma, createMemoryLog } from './fake-figma'
import { FIGMA_PAGES } from './pages'
import { colorScopes, pickFont } from './plan'
import { syncEffectStyles, syncTextStyles } from './styles'
import { upsertPages } from './upsert'
import { syncVariables } from './variables'

const tokens = tokensJson as unknown as TokenSet
const GEIST: FontName[] = ['Regular', 'Medium', 'SemiBold', 'Bold'].map(style => ({ family: 'Geist', style }))
const GEIST_MONO: FontName[] = ['Regular', 'Medium'].map(style => ({ family: 'Geist Mono', style }))
// Les styles de texte lisent la police par variable (coque Théo) : SF Pro / SF Mono, plus Geist.
const SF_PRO: FontName[] = ['Regular', 'Medium', 'SemiBold', 'Bold'].map(style => ({ family: 'SF Pro', style }))
const SF_MONO: FontName[] = ['Regular', 'Medium'].map(style => ({ family: 'SF Mono', style }))

describe('syncVariables — idempotent', () => {
  it('crée les cinq collections et une variable par token', async () => {
    const fake = createFakeFigma()
    await syncVariables(fake.api, tokens, createMemoryLog())
    expect(fake.collections.map(c => c.name)).toEqual(['Primitives', 'Color', 'Radius', 'Spacing', 'ZIndex'])
    const expected =
      tokens.primitives.length +
      tokens.colors.length +
      tokens.radius.length +
      tokens.spacing.length +
      tokens.zIndex.length
    expect(fake.variables).toHaveLength(expected)
  })

  it('relancer deux fois donne le même fichier : aucune collection, aucune variable, aucun mode en double', async () => {
    const fake = createFakeFigma()
    await syncVariables(fake.api, tokens, createMemoryLog())
    const snapshot = JSON.stringify({ c: fake.collections, v: fake.variables })
    await syncVariables(fake.api, tokens, createMemoryLog())
    expect(JSON.stringify({ c: fake.collections, v: fake.variables })).toBe(snapshot)
  })

  it('Color a deux modes Light/Dark ; Primitives un seul mode, masqué des sélecteurs', async () => {
    const fake = createFakeFigma()
    await syncVariables(fake.api, tokens, createMemoryLog())
    const color = fake.collections.find(c => c.name === 'Color')
    expect(color?.modes.map(m => m.name)).toEqual(['Light', 'Dark'])
    const prim = fake.collections.find(c => c.name === 'Primitives')
    expect(prim?.modes.map(m => m.name)).toEqual(['Value'])
    const p500 = fake.variables.find(v => v.name === 'primary/500')
    expect(p500?.scopes).toEqual([])
  })

  it('garde l’alias vers la primitive, et le vrai nom CSS en code syntax WEB', async () => {
    const fake = createFakeFigma()
    await syncVariables(fake.api, tokens, createMemoryLog())
    const color = fake.collections.find(c => c.name === 'Color')
    const halo = fake.variables.find(v => v.name === 'guide/halo')
    const p500 = fake.variables.find(v => v.name === 'primary/500')
    const p400 = fake.variables.find(v => v.name === 'primary/400')
    const [light, dark] = color?.modes ?? []
    expect(halo?.valuesByMode[light?.modeId ?? '']).toEqual({ type: 'VARIABLE_ALIAS', id: p500?.id })
    expect(halo?.valuesByMode[dark?.modeId ?? '']).toEqual({ type: 'VARIABLE_ALIAS', id: p400?.id })
    expect(halo?.codeSyntax.WEB).toBe('var(--bellum-guide-halo)')
    expect(fake.variables.find(v => v.name === 'md')?.codeSyntax.WEB).toBe('var(--radius-md)')
  })

  it('un alias vers une couleur de la MÊME collection se résout quel que soit l’ordre', async () => {
    const fake = createFakeFigma()
    await syncVariables(fake.api, tokens, createMemoryLog())
    const base = fake.variables.find(v => v.name === 'legacy/bg-base')
    const bg = fake.variables.find(v => v.name === 'bg/default')
    expect(Object.values(base?.valuesByMode ?? {})).toContainEqual({ type: 'VARIABLE_ALIAS', id: bg?.id })
  })

  it('plan Starter : le mode Dark refusé est JOURNALISÉ, et le clair est quand même écrit', async () => {
    const fake = createFakeFigma({ singleModeOnly: true })
    const log = createMemoryLog()
    await syncVariables(fake.api, tokens, log)
    expect(log.lines.some(l => l.level === 'error' && /Dark/.test(l.text))).toBe(true)
    const bg = fake.variables.find(v => v.name === 'bg/default')
    expect(Object.keys(bg?.valuesByMode ?? {})).toHaveLength(1)
  })

  it('pose des scopes précis : fond, texte, bordure, rayon, gap', async () => {
    const fake = createFakeFigma()
    await syncVariables(fake.api, tokens, createMemoryLog())
    const scopes = (name: string): VariableScope[] | undefined => fake.variables.find(v => v.name === name)?.scopes
    expect(scopes('bg/default')).toEqual(['FRAME_FILL', 'SHAPE_FILL'])
    expect(scopes('text/primary')).toEqual(['TEXT_FILL'])
    expect(scopes('border/default')).toEqual(['STROKE_COLOR'])
    expect(scopes('md')).toEqual(['CORNER_RADIUS'])
    expect(scopes('4')).toEqual(['GAP'])
  })
})

describe('colorScopes', () => {
  it.each([
    ['surface/2', ['FRAME_FILL', 'SHAPE_FILL']],
    ['soft/danger/bg', ['FRAME_FILL', 'SHAPE_FILL']],
    ['soft/danger/text', ['TEXT_FILL']],
    ['soft/danger/border', ['STROKE_COLOR']],
    ['on/primary', ['TEXT_FILL']],
    ['success/text', ['TEXT_FILL']],
    ['chip/rest-text', ['TEXT_FILL']],
    ['focus/ring', ['STROKE_COLOR']],
    ['legacy/text-muted', ['TEXT_FILL']],
    ['legacy/violet-500', ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR']],
  ])('%s → %j', (name, expected) => {
    expect(colorScopes(name)).toEqual(expected)
  })
})

describe('pickFont — Geist, sinon Inter JOURNALISÉ', () => {
  it('prend Geist quand il est installé', () => {
    expect(
      pickFont(
        [...GEIST, ...GEIST_MONO].map(fontName => ({ fontName })),
        'Geist',
        600,
      ),
    ).toEqual({
      fontName: { family: 'Geist', style: 'SemiBold' },
    })
  })

  it('replie sur Inter en le disant', () => {
    const inter = ['Regular', 'Medium', 'Semi Bold', 'Bold'].map(style => ({ fontName: { family: 'Inter', style } }))
    const picked = pickFont(inter, 'Geist Mono', 500)
    expect(picked.fontName).toEqual({ family: 'Inter', style: 'Medium' })
    expect(picked.fallback).toMatch(/Geist Mono.*Inter/)
  })
})

describe('styles — idempotents', () => {
  it('écrit sept styles de texte et deux ombres par token (clair, sombre), sans doublon au 2e passage', async () => {
    const fake = createFakeFigma({ fonts: [...SF_PRO, ...SF_MONO] })
    const log = createMemoryLog()
    for (let i = 0; i < 2; i++) {
      await syncTextStyles(fake.api, tokens, log)
      await syncEffectStyles(fake.api, tokens, log)
    }
    expect(fake.textStyles.map(s => s.name)).toEqual(tokens.textStyles.map(t => `text/${t.name}`))
    expect(fake.effectStyles).toHaveLength(tokens.shadows.length * 2)
    const body = fake.textStyles.find(s => s.name === 'text/body')
    expect(body).toMatchObject({ fontName: { family: 'SF Pro', style: 'Regular' }, fontSize: 14 })
    expect(body?.lineHeight).toEqual({ unit: 'PERCENT', value: 150 })
    const caption = fake.textStyles.find(s => s.name === 'text/caption')
    expect(caption?.letterSpacing).toEqual({ unit: 'PERCENT', value: 3 })
    expect(log.lines.filter(l => l.level !== 'info')).toEqual([])
  })

  it('sans Geist installé, chaque repli est journalisé', async () => {
    const inter = ['Regular', 'Medium', 'Semi Bold', 'Bold'].map(style => ({ family: 'Inter', style }))
    const fake = createFakeFigma({ fonts: inter })
    const log = createMemoryLog()
    await syncTextStyles(fake.api, tokens, log)
    expect(fake.textStyles.every(s => s.fontName.family === 'Inter')).toBe(true)
    expect(log.lines.filter(l => l.level === 'warn' && /Inter/.test(l.text)).length).toBeGreaterThan(0)
  })
})

describe('pages du fichier', () => {
  it('reprend « Page 1 » comme Cover et ne recrée rien au 2e passage', () => {
    const fake = createFakeFigma()
    upsertPages(fake.api, FIGMA_PAGES)
    upsertPages(fake.api, FIGMA_PAGES)
    expect(fake.pages.map(p => p.name)).toEqual([...FIGMA_PAGES])
    expect(FIGMA_PAGES).toEqual([
      'Cover',
      'Nouveautés',
      'Getting Started',
      'Foundations',
      '---',
      'Components',
      'Components — Actions',
      'Components — Formulaires',
      'Components — Données',
      'Components — Navigation',
      'Components — Retours',
      'Components — Surfaces',
      'Components — Identité',
      'Templates',
      'Rules (UX)',
    ])
  })
})
