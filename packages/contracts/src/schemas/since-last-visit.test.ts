import { describe, expect, it } from 'vitest'
import {
  SINCE_LAST_VISIT_LINES,
  SINCE_LAST_VISIT_UNMEASURED_STATES,
  sinceLastVisitDigestSchema,
  sinceLastVisitLineSchema,
  sinceLastVisitLineSpeaks,
} from './since-last-visit.js'
import type { SinceLastVisitLine } from './since-last-visit.js'

/**
 * L'invariant que ce contrat existe pour tenir : **une valeur absente ne
 * s'affiche jamais « 0 »**.
 *
 * Il n'est pas confié à une relecture ni à une convention de nommage : c'est le
 * schéma qui refuse la réponse fautive. Un producteur qui rendrait
 * `unavailable` avec un `count: 0` — la forme exacte du faux zéro — ne passe
 * pas la validation.
 */

const line = (over: Partial<SinceLastVisitLine>): unknown => ({
  kind: 'replies_received',
  state: 'ready',
  reason: null,
  count: 0,
  scope: null,
  ...over,
})

describe('sinceLastVisitLineSchema', () => {
  it('lit un corpus NON VIDE — six lignes, chacune avec ses silences atteignables', () => {
    expect(SINCE_LAST_VISIT_LINES.length).toBe(6)
    expect(SINCE_LAST_VISIT_LINES).toContain('attack_angles_added')
    expect(SINCE_LAST_VISIT_LINES).toContain('night_routines_run')
    expect(Object.keys(SINCE_LAST_VISIT_UNMEASURED_STATES).sort()).toEqual([...SINCE_LAST_VISIT_LINES].sort())
    for (const kind of SINCE_LAST_VISIT_LINES) {
      expect(SINCE_LAST_VISIT_UNMEASURED_STATES[kind].length).toBeGreaterThan(0)
    }
  })

  it('accepte une ligne MESURÉE, zéro compris — « on a regardé, il n’y a rien »', () => {
    expect(sinceLastVisitLineSchema.safeParse(line({ count: 0 })).success).toBe(true)
    expect(sinceLastVisitLineSchema.safeParse(line({ kind: 'account_signals', count: 3, scope: 2 })).success).toBe(true)
  })

  it('sait dire NON : un état non mesuré qui porte un compte est REFUSÉ', () => {
    // C'est le faux zéro, dans sa forme exacte : « je n'ai pas pu regarder » et
    // « il ne s'est rien passé » écrits de la même façon.
    const fake = sinceLastVisitLineSchema.safeParse(
      line({ state: 'not_connected', reason: 'mailbox_not_connected', count: 0 }),
    )
    expect(fake.success).toBe(false)
  })

  it('sait dire NON : une ligne mesurée SANS compte est refusée', () => {
    expect(sinceLastVisitLineSchema.safeParse(line({ state: 'ready', count: null })).success).toBe(false)
  })

  it('sait dire NON : un silence SANS raison est refusé', () => {
    // Un bloc vide qui ne dit pas pourquoi il est vide est le défaut de départ.
    expect(sinceLastVisitLineSchema.safeParse(line({ state: 'unavailable', reason: null, count: null })).success).toBe(
      false,
    )
  })

  it('sait dire NON : un second compte sur une ligne non mesurée est refusé', () => {
    expect(
      sinceLastVisitLineSchema.safeParse(
        line({ kind: 'account_signals', state: 'unavailable', reason: 'boom', count: null, scope: 2 }),
      ).success,
    ).toBe(false)
  })
})

describe('sinceLastVisitLineSpeaks', () => {
  it('une ligne mesurée à ZÉRO se tait — un zéro décoratif n’apprend rien', () => {
    expect(sinceLastVisitLineSpeaks(line({ count: 0 }) as SinceLastVisitLine)).toBe(false)
  })

  it('une ligne mesurée à plus de zéro parle', () => {
    expect(sinceLastVisitLineSpeaks(line({ count: 1 }) as SinceLastVisitLine)).toBe(true)
  })

  it('une ligne NON mesurée parle TOUJOURS — c’est là que le silence mentirait', () => {
    for (const kind of SINCE_LAST_VISIT_LINES) {
      for (const state of SINCE_LAST_VISIT_UNMEASURED_STATES[kind]) {
        const value = line({ kind, state, reason: 'r', count: null, scope: null }) as SinceLastVisitLine
        expect(sinceLastVisitLineSpeaks(value), `${kind}/${state}`).toBe(true)
      }
    }
  })
})

/**
 * #2106.30/.31 (épopée #2802) — les deux agrégats SERVEUR du résumé condensé
 * de longue absence : ce qui a EXPIRÉ, ce qu'un COLLÈGUE a traité. `null` =
 * non mesurable, jamais un zéro fabriqué — même invariant que les six lignes,
 * porté cette fois par deux scalaires du digest plutôt que par une ligne.
 */
describe('sinceLastVisitDigestSchema — expiredItemsCount / treatedByColleagueCount', () => {
  const digest = (
    over: Partial<{ expiredItemsCount: number | null; treatedByColleagueCount: number | null }> = {},
  ) => ({
    since: '2026-08-26T18:04:00.000Z',
    lines: [],
    expiredItemsCount: null,
    treatedByColleagueCount: null,
    ...over,
  })

  it('accepte les deux agrégats à `null` — non mesurables', () => {
    expect(sinceLastVisitDigestSchema.safeParse(digest()).success).toBe(true)
  })

  it('accepte un compte RÉEL, zéro compris', () => {
    expect(sinceLastVisitDigestSchema.safeParse(digest({ expiredItemsCount: 0 })).success).toBe(true)
    expect(sinceLastVisitDigestSchema.safeParse(digest({ treatedByColleagueCount: 5 })).success).toBe(true)
  })

  it('sait dire NON : un compte négatif est refusé', () => {
    expect(sinceLastVisitDigestSchema.safeParse(digest({ expiredItemsCount: -1 })).success).toBe(false)
    expect(sinceLastVisitDigestSchema.safeParse(digest({ treatedByColleagueCount: -1 })).success).toBe(false)
  })

  it('sait dire NON : un digest sans ces deux champs est refusé — jamais un défaut deviné', () => {
    const { expiredItemsCount, treatedByColleagueCount, ...rest } = digest()
    expect(sinceLastVisitDigestSchema.safeParse(rest).success).toBe(false)
  })
})
