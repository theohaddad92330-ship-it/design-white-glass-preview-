import { describe, expect, it } from 'vitest'
import { entityTypeSchema, signalKindSchema } from './primitives.js'
import { entityNodeSchema, recentSignalSchema } from './research.js'

describe('entityTypeSchema — Théo taxonomy (restitution p.6)', () => {
  it('accepts the qualification types (SPV / cédée / homonyme / bruit / marque)', () => {
    for (const t of ['SPV', 'cedee', 'homonyme', 'bruit', 'marque', 'filiale_strategique']) {
      expect(() => entityTypeSchema.parse(t)).not.toThrow()
    }
  })

  it('still accepts the structural types + the generic operational bucket', () => {
    for (const t of ['filiale', 'BU', 'JV', 'operational']) expect(() => entityTypeSchema.parse(t)).not.toThrow()
  })
})

describe('recentSignalSchema — impact (#2107.31)', () => {
  it('accepts a signal carrying its business impact, distinct from sales_implication', () => {
    const parsed = recentSignalSchema.parse({
      signal: '3 300 recrutements annoncés en France pour 2026',
      sales_implication: 'Renfort recrutement/formation IT à proposer sur la vague de recrutement.',
      impact: 'Transformation à l’échelle du groupe, pas d’une seule direction.',
    })
    expect(parsed.impact).toBe('Transformation à l’échelle du groupe, pas d’une seule direction.')
    expect(parsed.impact).not.toBe(parsed.sales_implication)
  })

  it('leaves impact absent when the analysis evaluated none — never a filler sentence', () => {
    const parsed = recentSignalSchema.parse({ signal: 'Nomination DSI' })
    expect(parsed.impact).toBeUndefined()
  })
})

describe('entityNodeSchema — relevance/getsPlay survive parse', () => {
  it('keeps the deterministic gate fields instead of stripping them', () => {
    const parsed = entityNodeSchema.parse({
      name: 'Société Générale Côte d’Ivoire',
      type: 'homonyme',
      relevance: 'out_of_sector',
      relevanceReason: 'hors périmètre géographique (international)',
      getsPlay: false,
    })
    expect(parsed.relevance).toBe('out_of_sector')
    expect(parsed.getsPlay).toBe(false)
    expect(parsed.relevanceReason).toContain('géographique')
  })

  it('keeps the actionable flag (Théo p.6 default filter)', () => {
    const spv = entityNodeSchema.parse({ name: '2009 KOALA FINANCE', type: 'SPV', actionable: false })
    expect(spv.actionable).toBe(false)
    const bu = entityNodeSchema.parse({ name: 'Boursorama', type: 'BU', actionable: true })
    expect(bu.actionable).toBe(true)
  })

  // #2302.38/.44 (épopée #2961) — masquage par défaut d'une entité inactive
  // et d'une adresse administrative sans équipe (territory_resolver.py).
  // Optionnel/nullable : un dossier antérieur à ce lot n'a ni l'un ni
  // l'autre, jamais une valeur devinée à sa place.
  it('accepts is_active / has_team, both optional', () => {
    const inactive = entityNodeSchema.parse({ name: 'Filiale Cessée', type: 'filiale', is_active: false })
    expect(inactive.is_active).toBe(false)
    const noTeam = entityNodeSchema.parse({ name: 'Siège Administratif', type: 'entite_juridique', has_team: false })
    expect(noTeam.has_team).toBe(false)
    const older = entityNodeSchema.parse({ name: 'Filiale Y', type: 'filiale' })
    expect(older.is_active).toBeUndefined()
    expect(older.has_team).toBeUndefined()
  })
})

describe('recentSignalSchema — freshness (Théo p.7)', () => {
  it('accepts a freshness class', () => {
    const parsed = recentSignalSchema.parse({ signal: 'x', freshness: 'archive' })
    expect(parsed.freshness).toBe('archive')
  })
})

// #2634.1 — LinkedIn comme source de signaux d'achat, par une voie autorisée
// (saisie, import, connecteur) — jamais un scraping. Un signal DÉCLARÉ porte
// sa provenance : l'écran doit pouvoir dire « saisi par X le JJ/MM » et le
// distinguer d'un signal détecté par l'IA (`entry_kind` absent = détecté,
// comme avant ce lot — aucune régression sur les signaux déjà en base).
describe('recentSignalSchema — provenance déclarée (#2634.1)', () => {
  it('un signal détecté (comme avant ce lot) ne porte aucun entry_kind', () => {
    const parsed = recentSignalSchema.parse({ signal: 'x', source: 'APEC' })
    expect(parsed.entry_kind).toBeUndefined()
  })

  it('un signal déclaré porte son entry_kind, qui a déclaré et quand', () => {
    const parsed = recentSignalSchema.parse({
      signal: 'Poste Lead Data Engineer publié',
      source: 'LinkedIn',
      entry_kind: 'manual',
      declared_at: '2026-09-22T18:00:00.000Z',
      declared_by_name: 'Louis Schlegel',
    })
    expect(parsed.entry_kind).toBe('manual')
    expect(parsed.declared_by_name).toBe('Louis Schlegel')
  })

  it('un signal importé porte la date du document, distincte de la date de déclaration', () => {
    const parsed = recentSignalSchema.parse({
      signal: 'x',
      entry_kind: 'import',
      document_date: '2026-06-01',
    })
    expect(parsed.document_date).toBe('2026-06-01')
  })

  // LE TEST QUI SAIT DIRE NON : `entry_kind` est une table FERMÉE. Une valeur
  // hors catalogue romprait le badge de provenance affiché à l'écran.
  it('REFUSE un entry_kind hors catalogue', () => {
    expect(() => recentSignalSchema.parse({ signal: 'x', entry_kind: 'scraped' })).toThrow()
  })
})

// #2617.1 — RETENU : les six catégories métier de Simon (recrutement · appel
// d'offres · marché public · nomination · budget · historique) demandent une
// classification côté SERVEUR ET côté web. `appel_offres`/`marche_public`
// manquaient au contrat serveur (`signalKindSchema`), qui ne portait déjà que
// `nomination`/`budget`/`recrutement` — un appel d'offres privé et un marché
// PUBLIC (une collectivité, une administration) n'ont ni le même acheteur ni
// le même calendrier, et Simon veut pouvoir les distinguer.
describe('signalKindSchema — les six catégories métier de Simon (#2617.1)', () => {
  it('porte déjà nomination, budget et recrutement', () => {
    for (const kind of ['nomination', 'budget', 'recrutement']) expect(() => signalKindSchema.parse(kind)).not.toThrow()
  })

  it('accepte désormais appel_offres et marche_public, distincts l’un de l’autre', () => {
    expect(signalKindSchema.parse('appel_offres')).toBe('appel_offres')
    expect(signalKindSchema.parse('marche_public')).toBe('marche_public')
  })

  it('ne retire aucun des neuf genres existants (on archive, on ne supprime pas)', () => {
    for (const kind of ['projet', 'incident', 'regulation', 'acquisition', 'partenariat', 'restructuration']) {
      expect(() => signalKindSchema.parse(kind)).not.toThrow()
    }
  })
})
