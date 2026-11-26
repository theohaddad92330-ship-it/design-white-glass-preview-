import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LAURA_DOCUMENT_TABS,
  SPACE_CATALOGUE_TABS,
  SPACE_PERIMETER_TABS,
  SPACE_RULES_TABS,
  spaceRulesSearchSchema,
} from './hub-tabs'

const ROUTES = join(__dirname, '..', '..', '..', 'routes')

/** Un ancien écran → la page et l'onglet qui le portent désormais (maquettes Théo V22, Louis 22/10/2026). */
const REDIRECTS: { from: string; file: string; to: string; onglet?: string; tabs: readonly string[] }[] = [
  {
    from: '/settings/pipeline',
    file: 'settings/pipeline.tsx',
    to: '/settings/workspace-rules',
    onglet: 'pipeline',
    tabs: SPACE_RULES_TABS,
  },
  {
    from: '/settings/commercial-load',
    file: 'settings/commercial-load.tsx',
    to: '/settings/workspace-rules',
    onglet: 'charge',
    tabs: SPACE_RULES_TABS,
  },
  {
    from: '/settings/reverse-market',
    file: 'settings/reverse-market.tsx',
    to: '/settings/workspace-rules',
    onglet: 'marche-inverse',
    tabs: SPACE_RULES_TABS,
  },
  {
    from: '/settings/finance',
    file: 'settings/finance.tsx',
    to: '/settings/workspace-rules',
    onglet: 'marge',
    tabs: SPACE_RULES_TABS,
  },
  {
    from: '/settings/do-not-contact',
    file: 'settings/do-not-contact.tsx',
    to: '/settings/workspace-rules',
    onglet: 'acces',
    tabs: SPACE_RULES_TABS,
  },
  {
    from: '/expenses/bareme',
    file: 'expenses/bareme.tsx',
    to: '/settings/workspace-rules',
    onglet: 'frais',
    tabs: SPACE_RULES_TABS,
  },
  {
    from: '/settings/legal-entities',
    file: 'settings/legal-entities.tsx',
    to: '/settings/business-units',
    onglet: 'societes',
    tabs: SPACE_PERIMETER_TABS,
  },
  {
    from: '/settings/lexicon',
    file: 'settings/lexicon.tsx',
    to: '/settings/catalogues',
    onglet: 'vocabulaire',
    tabs: SPACE_CATALOGUE_TABS,
  },
]

describe('Réglages refondus — les anciennes adresses mènent à leur onglet', () => {
  it('LIT les routes : le corpus n’est pas vide', () => {
    expect(REDIRECTS.length).toBeGreaterThanOrEqual(8)
    for (const entry of REDIRECTS) expect(readFileSync(join(ROUTES, entry.file), 'utf8').length).toBeGreaterThan(0)
  })

  it.each(REDIRECTS)('$from redirige dans son beforeLoad vers $to ($onglet), sur un onglet qui existe', entry => {
    const source = readFileSync(join(ROUTES, entry.file), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toMatch(/beforeLoad\s*:/)
    expect(code).toContain('throw redirect(')
    expect(code).not.toContain('<Navigate')
    expect(code).toContain(`to: '${entry.to}'`)
    expect(code).toContain(`onglet: '${entry.onglet}'`)
    expect(entry.tabs).toContain(entry.onglet)
  })

  it('NON : une adresse abîmée retombe sur le premier onglet, elle ne casse pas la page', () => {
    expect(spaceRulesSearchSchema.parse({ onglet: 'nimporte-quoi' })).toEqual({ onglet: undefined })
    expect(spaceRulesSearchSchema.parse({ onglet: 'frais' })).toEqual({ onglet: 'frais' })
    expect(spaceRulesSearchSchema.parse({})).toEqual({})
  })

  it('les onglets de Laura › Documents sont ceux de la maquette', () => {
    expect(LAURA_DOCUMENT_TABS).toEqual(['documents', 'style'])
  })
})
