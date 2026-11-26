import { describe, expect, it } from 'vitest'
import {
  ECOSYSTEM_RELATION_ACTIONS,
  ECOSYSTEM_RELATION_TYPES,
  applyEcosystemCorrection,
  ecosystemPresence,
  relationMayAssert,
  relationTypeAsserts,
  type EcosystemRelation,
  type EcosystemRelationType,
} from './ecosystem-relation.js'

/**
 * #2122.20-.27 / .33 / .35 / .37 / .53-.55 / .62 / #2316.10 — LE VOCABULAIRE
 * DES RELATIONS D'ÉCOSYSTÈME, ET LES TROIS RÈGLES QUI L'EMPÊCHENT DE MENTIR.
 *
 * Neuf types, et neuf seulement : un dixième inventé à l'écran redeviendrait
 * une opinion — le neuvième (`rank2_potential`) a été ajouté par un arbitrage
 * écrit (#2316.10, 26/09/2026 nuit), additivement (GA-08), pas par un ajout
 * mécanique. Une relation qui AFFIRME un état (« en place », « accepte le
 * rang 2 ») n'a le droit de le dire qu'avec une preuve ATTACHÉE. Et « N ESN
 * observées » et « aucune ESN présente » lisent la MÊME dérivation, sinon les
 * deux phrases se contredisent sur le même écran.
 */

const PROOF = { label: 'Avis d’attribution du 12/03/2026', source: 'BOAMP', observed_at: '2026-03-12' }

function relation(over: Partial<EcosystemRelation> = {}): EcosystemRelation {
  return {
    id: 'rel-1',
    name: 'Vertex Systèmes (exemple)',
    type: 'historic_observed',
    proof: PROOF,
    confidence: 'moyenne',
    deduced: false,
    divergences: [],
    correction: null,
    ...over,
  }
}

describe('#2122.20-.27 / #2316.10 — neuf types, et neuf seulement', () => {
  it('nomme exactement les neuf relations du retour', () => {
    expect([...ECOSYSTEM_RELATION_TYPES]).toEqual([
      'competitor_potential',
      'partner_potential',
      'rank1_declared',
      'rank2_confirmed',
      'intermediation_platform',
      'historic_observed',
      'current_sourced',
      'team_declared',
      'rank2_potential',
    ])
  })

  it('range chaque type entre ceux qui AFFIRMENT et ceux qui supposent', () => {
    const affirment: EcosystemRelationType[] = [
      'rank1_declared',
      'rank2_confirmed',
      'historic_observed',
      'current_sourced',
      'team_declared',
    ]
    // #2316.10 — `rank2_potential` SUPPOSE : sans preuve attachée, un rang 2
    // ne peut pas affirmer, seulement se qualifier.
    const supposent: EcosystemRelationType[] = [
      'competitor_potential',
      'partner_potential',
      'intermediation_platform',
      'rank2_potential',
    ]
    for (const type of affirment) expect(relationTypeAsserts(type)).toBe(true)
    for (const type of supposent) expect(relationTypeAsserts(type)).toBe(false)
    expect(affirment.length + supposent.length).toBe(ECOSYSTEM_RELATION_TYPES.length)
  })
})

describe('#2122.37 — rien n’affirme sans preuve attachée', () => {
  it('un type qui affirme SANS preuve n’a pas le droit d’affirmer', () => {
    expect(relationMayAssert(relation({ type: 'rank2_confirmed', proof: null }))).toBe(false)
    expect(relationMayAssert(relation({ type: 'current_sourced', proof: null }))).toBe(false)
  })

  it('le même type AVEC sa preuve peut affirmer', () => {
    expect(relationMayAssert(relation({ type: 'rank2_confirmed', proof: PROOF }))).toBe(true)
  })

  it('un type qui SUPPOSE n’affirme jamais, preuve ou pas — il propose', () => {
    expect(relationMayAssert(relation({ type: 'partner_potential', proof: PROOF }))).toBe(false)
  })
})

describe('#2122.62 — « N observées » et « aucune présente » lisent la même dérivation', () => {
  it('rend le compte ET le prédicat depuis le même appel', () => {
    const presence = ecosystemPresence([relation(), relation({ id: 'rel-2', name: 'Orsan Conseil (exemple)' })])
    expect(presence.observed).toBe(2)
    expect(presence.none).toBe(false)
  })

  it('aucune relation : le compte est NON MESURÉ, jamais « 0 observées »', () => {
    const presence = ecosystemPresence([])
    expect(presence.observed).toBeNull()
    expect(presence.none).toBe(true)
  })

  it('ne compte JAMAIS une relation qui n’affirme rien — sinon les deux phrases divergent', () => {
    const presence = ecosystemPresence([relation({ type: 'partner_potential', proof: null })])
    expect(presence.observed).toBeNull()
    expect(presence.none).toBe(true)
  })

  it('une relation qui affirme SANS preuve ne compte pas non plus (.37 tenu au comptage)', () => {
    const presence = ecosystemPresence([relation({ type: 'current_sourced', proof: null })])
    expect(presence.observed).toBeNull()
    expect(presence.none).toBe(true)
  })
})

/**
 * #2316.15 — « 8 ESN observées » ET « aucune ESN actuelle » NE SE CONTREDISENT
 * PAS : la première compte l'HISTORIQUE, la seconde l'ACTUEL. `historicOnly`
 * sort du MÊME appel que `observed`/`none` (.62) — jamais un second calcul qui
 * pourrait diverger sur le même écran.
 */
describe('#2316.15 — historique seulement, jamais confondu avec de l’actuel', () => {
  it('tout est historique : `historicOnly` le dit', () => {
    const presence = ecosystemPresence([relation(), relation({ id: 'rel-2', name: 'Orsan Conseil (exemple)' })])
    expect(presence.historicOnly).toBe(true)
  })

  it('une seule relation ACTUELLE suffit à ne plus être « historique seulement »', () => {
    const presence = ecosystemPresence([relation(), relation({ id: 'rel-2', type: 'current_sourced' })])
    expect(presence.historicOnly).toBe(false)
  })

  it('aucune relation avérée : faux — .62 dit déjà « rien de prouvé », pas la peine de le redire', () => {
    expect(ecosystemPresence([]).historicOnly).toBe(false)
    expect(ecosystemPresence([relation({ type: 'partner_potential', proof: null })]).historicOnly).toBe(false)
  })
})

describe('#2122.53-.55 — la correction humaine domine, est attribuée, et n’efface rien', () => {
  const correction = {
    type: 'competitor_potential' as const,
    corrected_at: '2026-09-15T10:00:00.000Z',
    corrected_by: null,
  }

  it('domine IMMÉDIATEMENT : le type rendu est celui de l’humain', () => {
    const corrected = applyEcosystemCorrection(relation({ type: 'historic_observed' }), correction)
    expect(corrected.type).toBe('competitor_potential')
  })

  it('porte QUI et QUAND', () => {
    const corrected = applyEcosystemCorrection(relation(), { ...correction, corrected_by: 'Louis' })
    expect(corrected.correction).toEqual({
      type: 'competitor_potential',
      corrected_at: '2026-09-15T10:00:00.000Z',
      corrected_by: 'Louis',
      previous_type: 'historic_observed',
    })
  })

  it('n’EFFACE PAS l’observation : le type observé survit dans `previous_type`, avec sa preuve', () => {
    const corrected = applyEcosystemCorrection(relation({ type: 'current_sourced' }), correction)
    expect(corrected.correction?.previous_type).toBe('current_sourced')
    expect(corrected.proof).toEqual(PROOF)
  })

  it('une SECONDE correction garde le fait OBSERVÉ, pas la correction précédente', () => {
    const once = applyEcosystemCorrection(relation({ type: 'historic_observed' }), correction)
    const twice = applyEcosystemCorrection(once, { ...correction, type: 'partner_potential' })
    expect(twice.type).toBe('partner_potential')
    expect(twice.correction?.previous_type).toBe('historic_observed')
  })
})

describe('#2122.59 / .63 — les six actions, nommées à un seul endroit', () => {
  it('nomme exactement les six actions du retour', () => {
    expect([...ECOSYSTEM_RELATION_ACTIONS]).toEqual([
      'qualify',
      'find_sales_reps',
      'prepare_partner_approach',
      'mark_competitor',
      'mark_irrelevant',
      'add_field_note',
    ])
  })
})
