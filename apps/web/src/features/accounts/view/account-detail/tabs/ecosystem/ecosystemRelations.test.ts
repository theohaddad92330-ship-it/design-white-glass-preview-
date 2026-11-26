import { describe, expect, it } from 'vitest'
import type { AccountPartner } from '@bellum/contracts'
import { readEcosystem } from './ecosystemRelations'

/**
 * #2122.20-.27 / .33 / .35 / .37 / .53-.55 / .62 — LA LECTURE DE L'ÉCOSYSTÈME
 * D'UN COMPTE, DEPUIS LES DONNÉES QUI EXISTENT DÉJÀ.
 *
 * Aucun champ neuf côté serveur : `evidence_origins`, `certainty`,
 * `market_observation_count`, `rank`, `relationship`, `detected_at` sont là
 * depuis #1605 / #1624. Ce qui manquait, c'est de les LIRE comme un type de
 * relation nommé, avec sa preuve — et de ne rien affirmer quand la preuve
 * manque.
 */

function partner(over: Partial<AccountPartner> = {}): AccountPartner {
  return {
    id: 'p1',
    account_id: 'acc-1',
    entity_id: null,
    name: 'Vertex Systèmes (exemple)',
    rank: 'unknown',
    relationship: 'unknown',
    note: null,
    source: 'analysis',
    placements: 0,
    certainty: 'moyenne',
    scope: null,
    detected_at: '2026-08-20T09:00:00.000Z',
    created_at: '2026-08-20T09:00:00.000Z',
    ...over,
  }
}

describe('#2122.20-.27 — chaque ligne reçoit UN des huit types', () => {
  it('rang 1 + déclaration de l’équipe ⇒ « Rang 1 déclaré »', () => {
    const { relations } = readEcosystem({
      partners: [partner({ rank: 'rank1', source: 'declared', evidence_origins: ['workspace_declared'] })],
    })
    expect(relations[0]?.type).toBe('rank1_declared')
  })

  it('rang 2 avec une preuve attachée ⇒ « Rang 2 confirmé »', () => {
    const { relations } = readEcosystem({
      partners: [partner({ rank: 'rank2', evidence_origins: ['declared_subcontracting'] })],
    })
    expect(relations[0]?.type).toBe('rank2_confirmed')
  })

  // #2316.10 — le rang SURVIT à l'absence de preuve : avant cette ligne, un
  // rang 2 sans preuve retombait sur l'hypothèse générique (« Partenaire
  // potentiel » / « Concurrent potentiel ») et perdait l'information de rang.
  it('rang 2 SANS preuve attachée ⇒ « Rang 2 potentiel », jamais un constat', () => {
    const { relations } = readEcosystem({
      partners: [partner({ rank: 'rank2', relationship: 'partner', detected_at: null, certainty: null })],
    })
    expect(relations[0]?.type).toBe('rank2_potential')
    expect(relations[0]?.proof).toBeNull()
  })

  it('déclarée par l’équipe, sans rang ⇒ « Relation déclarée par l’équipe »', () => {
    const { relations } = readEcosystem({ partners: [partner({ source: 'declared', detected_at: null })] })
    expect(relations[0]?.type).toBe('team_declared')
  })

  it('source actuelle ⇒ « Relation actuelle sourcée »', () => {
    const { relations } = readEcosystem({ partners: [partner({ evidence_origins: ['current_inference'] })] })
    expect(relations[0]?.type).toBe('current_sourced')
  })

  it('corpus de parcours seul ⇒ « Relation historique observée »', () => {
    const { relations } = readEcosystem({
      partners: [partner({ evidence_origins: ['market_observation'], market_observation_count: 6 })],
    })
    expect(relations[0]?.type).toBe('historic_observed')
  })

  it('sans origine ni date : une HYPOTHÈSE, jamais un constat', () => {
    const { relations } = readEcosystem({
      partners: [partner({ detected_at: null, relationship: 'competitor', certainty: null })],
    })
    expect(relations[0]?.type).toBe('competitor_potential')
    expect(relations[0]?.proof).toBeNull()
  })

  it('une ESN ouverte à la sous-traitance sans rang ⇒ « Plateforme d’intermédiation »', () => {
    const { relations } = readEcosystem({
      partners: [partner({ evidence_origins: ['declared_subcontracting'], rank: 'unknown' })],
    })
    expect(relations[0]?.type).toBe('intermediation_platform')
  })

  it('relation « partenaire » sans preuve ⇒ « Partenaire potentiel »', () => {
    const { relations } = readEcosystem({
      partners: [partner({ relationship: 'partner', detected_at: null, certainty: null })],
    })
    expect(relations[0]?.type).toBe('partner_potential')
  })
})

describe('#2122.33 / .37 — la preuve, et ce qu’on déduit', () => {
  it('attache la SOURCE et la DATE de la preuve, jamais la date du jour', () => {
    const { relations } = readEcosystem({
      partners: [
        partner({
          evidence_origins: ['current_inference'],
          scope: 'TMA du portail',
          detected_at: '2026-03-12T00:00:00.000Z',
        }),
      ],
    })
    expect(relations[0]?.proof).toEqual({
      label: 'TMA du portail',
      source: 'current_inference',
      observed_at: '2026-03-12T00:00:00.000Z',
    })
  })

  it('une détection SANS date ne prouve rien — elle n’a pas le droit d’affirmer', () => {
    const { relations } = readEcosystem({
      partners: [partner({ evidence_origins: ['current_inference'], detected_at: null })],
    })
    expect(relations[0]?.proof).toBeNull()
  })

  it('marque « déduit » ce que seule une source actuelle porte, pas ce que l’équipe déclare', () => {
    const deduite = readEcosystem({ partners: [partner({ evidence_origins: ['current_inference'] })] })
    const declaree = readEcosystem({
      partners: [partner({ source: 'declared', evidence_origins: ['workspace_declared', 'current_inference'] })],
    })
    expect(deduite.relations[0]?.deduced).toBe(true)
    expect(declaree.relations[0]?.deduced).toBe(false)
  })
})

describe('#2122.35 — deux sources qui divergent s’affichent TOUTES LES DEUX', () => {
  const divergent = partner({
    evidence_origins: ['market_observation', 'current_inference'],
    certainty: 'faible',
    market_observation_count: 9,
  })

  it('garde les deux évaluations, sans en choisir une', () => {
    const { relations } = readEcosystem({ partners: [divergent] })
    expect(relations[0]?.divergences.map(d => d.source)).toEqual(['current_inference', 'market_observation'])
    expect(relations[0]?.divergences.map(d => d.statement)).toEqual(['faible', 'forte'])
  })

  it('range la ligne dans « Informations à qualifier », avec sa raison', () => {
    const { toQualify } = readEcosystem({ partners: [divergent] })
    expect(toQualify).toEqual([{ id: 'p1', name: 'Vertex Systèmes (exemple)', reason: 'divergent_sources' }])
  })

  it('deux sources d’ACCORD ne demandent rien à qualifier', () => {
    const { toQualify, relations } = readEcosystem({
      partners: [
        partner({
          evidence_origins: ['market_observation', 'current_inference'],
          certainty: 'forte',
          market_observation_count: 9,
        }),
      ],
    })
    expect(relations[0]?.divergences).toEqual([])
    expect(toQualify).toEqual([])
  })

  it('un type qui AFFIRME sans preuve se range aussi à qualifier (.37)', () => {
    const { toQualify } = readEcosystem({
      partners: [partner({ source: 'declared', detected_at: null, created_at: '' })],
    })
    expect(toQualify[0]?.reason).toBe('no_proof')
  })
})

describe('#2122.62 — le compte et la négation sortent du MÊME appel', () => {
  it('compte les seules relations qui ont le droit d’affirmer', () => {
    const { presence } = readEcosystem({
      partners: [
        partner({ id: 'a', evidence_origins: ['market_observation'], market_observation_count: 6 }),
        partner({ id: 'b', relationship: 'competitor', detected_at: null, certainty: null }),
      ],
    })
    expect(presence).toEqual({ observed: 1, none: false, historicOnly: true })
  })

  it('aucune ligne : « non mesuré », jamais « 0 »', () => {
    expect(readEcosystem({ partners: [] }).presence).toEqual({ observed: null, none: true, historicOnly: false })
  })
})

// #2316.15 — « 8 ESN observées » ET « aucune ESN actuelle » se réconcilient à
// l'écran au lieu de se contredire : `historicOnly` sort de la MÊME lecture.
describe('#2316.15 — historique seulement, jamais confondu avec de l’actuel', () => {
  it('une ligne DÉCLARÉE par l’équipe rend faux `historicOnly` — elle est actuelle', () => {
    const { presence } = readEcosystem({
      partners: [
        partner({ id: 'a', evidence_origins: ['market_observation'], market_observation_count: 6 }),
        partner({ id: 'b', source: 'declared', evidence_origins: ['workspace_declared'] }),
      ],
    })
    expect(presence.historicOnly).toBe(false)
  })
})

describe('#2122.53-.55 — la correction humaine passe par-dessus la dérivation', () => {
  it('domine immédiatement, est attribuée, et garde le type observé', () => {
    const { relations } = readEcosystem({
      partners: [partner({ evidence_origins: ['market_observation'], market_observation_count: 6 })],
      corrections: new Map([
        [
          'p1',
          { type: 'competitor_potential' as const, corrected_at: '2026-09-15T10:00:00.000Z', corrected_by: 'Louis' },
        ],
      ]),
    })
    expect(relations[0]?.type).toBe('competitor_potential')
    expect(relations[0]?.correction?.previous_type).toBe('historic_observed')
    expect(relations[0]?.correction?.corrected_by).toBe('Louis')
    // L'observation survit : sa preuve est toujours attachée.
    expect(relations[0]?.proof?.source).toBe('market_observation')
  })
})
