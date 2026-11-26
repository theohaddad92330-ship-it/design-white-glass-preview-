import { OUTREACH_PLAYBOOK_KEYS, outreachTemplateKeySchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { PLAYBOOK_FAMILY_ORDER } from './playbook-families'
import { distinctChannels, filterCatalog, foldText, sequenceCatalog } from './sequence-catalog'

describe('sequenceCatalog', () => {
  it('liste chaque situation ET chaque gabarit : rien de retiré', () => {
    const catalog = sequenceCatalog()
    expect(catalog).toHaveLength(OUTREACH_PLAYBOOK_KEYS.length + outreachTemplateKeySchema.options.length)
    expect(new Set(catalog.map(entry => entry.id)).size).toBe(catalog.length)
  })

  it('range chaque entrée dans une famille connue, avec au moins une étape', () => {
    for (const entry of sequenceCatalog()) {
      expect(PLAYBOOK_FAMILY_ORDER).toContain(entry.family)
      expect(entry.stepKinds.length).toBeGreaterThan(0)
    }
  })

  it('un gabarit rangé sous une situation prend la famille de cette situation', () => {
    const catalog = sequenceCatalog()
    const family = (id: string) => catalog.find(entry => entry.id === id)?.family
    expect(family('template:post_meeting_followup')).toBe(family('playbook:after_meeting'))
    expect(family('template:dormant_connection')).toBe(family('playbook:win_back'))
  })
})

describe('filterCatalog', () => {
  const entries = sequenceCatalog()
  const textOf = (entry: (typeof entries)[number]) => entry.key.replace(/_/g, ' ')

  it('sans filtre, garde tout', () => {
    expect(filterCatalog(entries, { query: '', families: new Set() }, textOf)).toHaveLength(entries.length)
  })

  it('multi-sélection : deux familles cochées gardent l’union', () => {
    const one = filterCatalog(entries, { query: '', families: new Set(['staffing']) }, textOf)
    const two = filterCatalog(entries, { query: '', families: new Set(['staffing', 'meeting']) }, textOf)
    expect(one.every(entry => entry.family === 'staffing')).toBe(true)
    expect(two.length).toBeGreaterThan(one.length)
    expect(two.every(entry => entry.family === 'staffing' || entry.family === 'meeting')).toBe(true)
  })

  it('cherche sans tenir compte des accents ni de la casse', () => {
    expect(foldText('Réactivation')).toBe('reactivation')
    const found = filterCatalog(entries, { query: 'win back', families: new Set() }, textOf)
    expect(found.map(entry => entry.id)).toContain('playbook:win_back')
  })

  it('une requête sans résultat rend une liste vide, jamais une ligne fantôme', () => {
    expect(filterCatalog(entries, { query: 'zzz-introuvable', families: new Set() }, textOf)).toEqual([])
  })
})

describe('distinctChannels', () => {
  it('dédoublonne en gardant l’ordre', () => {
    expect(distinctChannels(['email', 'call', 'email'])).toEqual(['email', 'call'])
  })
})
