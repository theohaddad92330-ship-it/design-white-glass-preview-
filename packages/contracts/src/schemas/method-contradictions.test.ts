import { describe, expect, it } from 'vitest'
import {
  METHOD_CONTRADICTIONS,
  METHOD_SOURCE_TIERS,
  methodContradictionSchema,
  resolveMethodContradiction,
  type MethodContradiction,
} from './method-contradictions.js'

/**
 * #3382 (reste : « registre des contradictions ») — aucune contradiction n'est
 * réglée au hasard par le modèle : chacune porte une décision par canal et par
 * condition, avec sa source gagnante, sa date et sa version.
 */

const first = METHOD_CONTRADICTIONS[0] as MethodContradiction

function withDecisions(decisions: MethodContradiction['decisions']): unknown {
  return { ...first, decisions }
}

describe('registre des contradictions (#3382)', () => {
  it('chaque entrée du registre respecte son schéma', () => {
    for (const entry of METHOD_CONTRADICTIONS) expect(methodContradictionSchema.safeParse(entry).success).toBe(true)
  })

  it('les trois contradictions tracées dans le dépôt sont enregistrées', () => {
    expect(METHOD_CONTRADICTIONS.map(c => c.contradiction_id).sort()).toEqual([
      'clause_aucune_demarche_commerciale',
      'ouverture_j_espere_que_vous_allez_bien',
      'script_appel_referencement_affirme',
    ])
  })

  it('une contradiction sans décision est refusée (jamais laissée au hasard)', () => {
    expect(methodContradictionSchema.safeParse(withDecisions([])).success).toBe(false)
  })

  it('une décision dont le gagnant n’est pas une des sources est refusée', () => {
    const bad = withDecisions([{ channels: [], condition: null, winner_ref: 'inconnue', decision: 'x' }])
    expect(methodContradictionSchema.safeParse(bad).success).toBe(false)
  })

  it('deux décisions qui se recouvrent (même condition, canaux qui se croisent) sont refusées', () => {
    const winner = first.sources[0]!.ref
    const bad = withDecisions([
      { channels: [], condition: 'c', winner_ref: winner, decision: 'a' },
      { channels: ['linkedin'], condition: 'c', winner_ref: winner, decision: 'b' },
    ])
    expect(methodContradictionSchema.safeParse(bad).success).toBe(false)
  })

  it('une source remplacée ne peut pas gagner', () => {
    const superseded = first.sources.find(s => s.status === 'superseded')
    expect(superseded).toBeDefined()
    const bad = withDecisions([{ channels: [], condition: null, winner_ref: superseded!.ref, decision: 'x' }])
    expect(methodContradictionSchema.safeParse(bad).success).toBe(false)
  })

  it('la hiérarchie des six niveaux est ordonnée : invariants d’abord, obsolète en dernier', () => {
    expect(METHOD_SOURCE_TIERS[0]).toBe('invariant')
    expect(METHOD_SOURCE_TIERS[METHOD_SOURCE_TIERS.length - 1]).toBe('experimental_or_obsolete')
    expect(METHOD_SOURCE_TIERS).toHaveLength(6)
  })

  it('le gagnant d’une décision n’est jamais d’un niveau inférieur à celui qu’il bat', () => {
    for (const entry of METHOD_CONTRADICTIONS) {
      const rank = (ref: string) => METHOD_SOURCE_TIERS.indexOf(entry.sources.find(s => s.ref === ref)!.tier)
      for (const d of entry.decisions) {
        for (const s of entry.sources) expect(rank(d.winner_ref)).toBeLessThanOrEqual(rank(s.ref))
      }
    }
  })

  it('resolveMethodContradiction rend la décision du canal ET de la condition', () => {
    const decision = resolveMethodContradiction('ouverture_j_espere_que_vous_allez_bien', {
      channel: 'linkedin',
      condition: 'historique réel avec la personne',
    })
    expect(decision?.decision).toMatch(/historique réel/)
    const cold = resolveMethodContradiction('ouverture_j_espere_que_vous_allez_bien', {
      channel: 'linkedin',
      condition: 'premier contact sans historique',
    })
    expect(cold?.decision).toMatch(/jamais/i)
  })

  it('resolveMethodContradiction ne devine pas : condition inconnue → null', () => {
    expect(
      resolveMethodContradiction('ouverture_j_espere_que_vous_allez_bien', { channel: 'email', condition: 'autre' }),
    ).toBeNull()
    expect(resolveMethodContradiction('inexistante', { channel: 'email', condition: null })).toBeNull()
  })
})

describe('miroir JSON pour apps/ia (#3382)', () => {
  it('le snapshot commité est la photo du registre (jamais une copie tapée à la main)', async () => {
    const { readFileSync } = await import('node:fs')
    const snapshot = JSON.parse(
      readFileSync(new URL('./method-contradictions.runtime.json', import.meta.url), 'utf8'),
    ) as unknown
    expect(snapshot).toEqual(JSON.parse(JSON.stringify(METHOD_CONTRADICTIONS)))
  })
})
