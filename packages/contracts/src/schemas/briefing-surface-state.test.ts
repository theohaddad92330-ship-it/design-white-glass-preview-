import { describe, expect, it } from 'vitest'
import {
  BRIEFING_SURFACE_GESTURES,
  BRIEFING_SURFACE_STATES,
  BRIEFING_SURFACE_STATE_CONTRACT,
  BRIEFING_SURFACE_STATE_FACETS,
  briefingSurfaceStateOf,
  briefingSurfaceStateSchema,
} from './briefing-surface-state.js'
import { briefingBlockStateSchema } from './daily-briefing.js'

/**
 * LE CONTRAT D'ÉTAT COMMUN DES TROIS PAGES (#2111).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS TIENNENT, ET CE QU'ILS NE TIENNENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ils ne vérifient AUCUNE phrase : la copie vit dans les locales et changera.
 * Ils tiennent les invariants sans lesquels le contrat redevient une opinion :
 *
 *  1. les onze états existent, et chacun a une entrée — pas de défaut muet ;
 *  2. AUCUN état ne produit la même carte qu'un autre (#2111.1) : deux états
 *     qui partagent leur titre sont exactement la « carte blanche » que le
 *     retour refuse ;
 *  3. chaque état porte une action principale ET une alternative, jamais la
 *     même deux fois (#2111.17 / #2111.18) ;
 *  4. la dérivation depuis l'état de FIL est TOTALE — les dix combinaisons
 *     possibles sont couvertes, sans branche par défaut ;
 *  5. aucun geste d'ENVOI : le copilote prépare, le commercial envoie.
 *
 * ⚠️ Elle sait dire NON : retirer une entrée du contrat, donner deux fois le
 * même titre, ou mettre le même geste en principal et en alternative fait
 * rougir un test nommé.
 */

describe('les onze états nommés (#2111.2 à #2111.12)', () => {
  it('sont exactement les onze du retour, et le schéma les accepte tous', () => {
    expect(BRIEFING_SURFACE_STATES).toHaveLength(11)
    for (const state of BRIEFING_SURFACE_STATES) {
      expect(briefingSurfaceStateSchema.safeParse(state).success).toBe(true)
    }
    expect(briefingSurfaceStateSchema.safeParse('presque_pret').success).toBe(false)
  })

  it('chacun a son entrée de contrat — aucun état sans réponse écrite', () => {
    for (const state of BRIEFING_SURFACE_STATES) {
      expect(Object.hasOwn(BRIEFING_SURFACE_STATE_CONTRACT, state), state).toBe(true)
    }
    expect(Object.keys(BRIEFING_SURFACE_STATE_CONTRACT).sort()).toEqual([...BRIEFING_SURFACE_STATES].sort())
  })

  it('les sept facettes que chaque état porte sont nommées (#2111.13 à #2111.19)', () => {
    expect([...BRIEFING_SURFACE_STATE_FACETS]).toEqual([
      'title',
      'reason',
      'stillPossible',
      'unlocks',
      'primaryAction',
      'alternative',
      'lastSync',
    ])
  })
})

describe('aucun état vide ne produit la même carte (#2111.1)', () => {
  it('un seul état ne rend AUCUN avis, et c’est celui où la donnée est là', () => {
    const silent = BRIEFING_SURFACE_STATES.filter(state => BRIEFING_SURFACE_STATE_CONTRACT[state] === null)
    expect(silent).toEqual(['ready_with_data'])
  })

  it('les dix autres ont un titre DIFFÉRENT — deux titres égaux sont la carte blanche refusée', () => {
    const titles = BRIEFING_SURFACE_STATES.map(state => BRIEFING_SURFACE_STATE_CONTRACT[state]?.titleKey).filter(
      (key): key is string => key != null,
    )
    expect(titles).toHaveLength(10)
    expect(new Set(titles).size).toBe(10)
  })

  it('chacun dit sa raison, ce qui reste possible et ce que la donnée débloque', () => {
    for (const state of BRIEFING_SURFACE_STATES) {
      const contract = BRIEFING_SURFACE_STATE_CONTRACT[state]
      if (!contract) continue
      expect(contract.reasonKey, state).toMatch(/\S/)
      expect(contract.stillPossibleKey, state).toMatch(/\S/)
      expect(contract.unlocksKey, state).toMatch(/\S/)
    }
  })
})

describe('chaque état porte deux gestes RÉELS (#2111.17 / #2111.18 / #2111.64)', () => {
  it('une action principale et une alternative, jamais la même', () => {
    for (const state of BRIEFING_SURFACE_STATES) {
      const contract = BRIEFING_SURFACE_STATE_CONTRACT[state]
      if (!contract) continue
      expect(BRIEFING_SURFACE_GESTURES, state).toContain(contract.primary)
      expect(BRIEFING_SURFACE_GESTURES, state).toContain(contract.alternative)
      expect(contract.primary, state).not.toBe(contract.alternative)
    }
  })

  it('aucun geste n’ENVOIE quoi que ce soit — le copilote prépare, le commercial envoie', () => {
    for (const gesture of BRIEFING_SURFACE_GESTURES) {
      expect(gesture, gesture).not.toMatch(/send|envoy|publish|deliver/i)
    }
  })

  it('aucune facette ne promet une PROBABILITÉ — refusée six fois', () => {
    const written = JSON.stringify(BRIEFING_SURFACE_STATE_CONTRACT)
    expect(written).not.toMatch(/probab|chance|forecast|likelihood|pondér/i)
  })
})

describe('la dérivation depuis l’état de fil est TOTALE (#2111.68)', () => {
  it('les dix combinaisons de l’état servi × « il y a de la donnée » ont une réponse', () => {
    const wire = briefingBlockStateSchema.options
    expect(wire).toHaveLength(5)
    for (const state of wire) {
      for (const hasData of [true, false]) {
        const derived = briefingSurfaceStateOf({ state, hasData })
        expect(BRIEFING_SURFACE_STATES, `${state}/${String(hasData)}`).toContain(derived)
      }
    }
  })

  it('« servi et rempli » et « servi et vide » ne sont PAS le même état', () => {
    expect(briefingSurfaceStateOf({ state: 'ready', hasData: true })).toBe('ready_with_data')
    expect(briefingSurfaceStateOf({ state: 'ready', hasData: false })).toBe('ready_empty')
  })

  it('une source muette reste « incomplète », remplie ou non — elle peut cacher la journée', () => {
    expect(briefingSurfaceStateOf({ state: 'partial', hasData: true })).toBe('partial')
    expect(briefingSurfaceStateOf({ state: 'partial', hasData: false })).toBe('partial')
  })

  it('sait dire NON : « pas connecté » n’est jamais « vide »', () => {
    expect(briefingSurfaceStateOf({ state: 'not_connected', hasData: false })).not.toBe('ready_empty')
    expect(briefingSurfaceStateOf({ state: 'not_connected', hasData: false })).toBe('not_connected')
    expect(briefingSurfaceStateOf({ state: 'unavailable', hasData: false })).toBe('unavailable')
    expect(briefingSurfaceStateOf({ state: 'missing_scope', hasData: false })).toBe('missing_scope')
  })

  it('les cinq états que le FIL ne sait pas encore dire sont déclarés, pas servis', () => {
    // La fondation nomme onze états ; l'API n'en prouve que six aujourd'hui.
    // Les cinq autres attendent leur producteur — les déclarer ne les rend pas
    // atteignables, et ce test dit lesquels restent à brancher.
    const derived = new Set(
      briefingBlockStateSchema.options.flatMap(state => [
        briefingSurfaceStateOf({ state, hasData: true }),
        briefingSurfaceStateOf({ state, hasData: false }),
      ]),
    )
    const notServedYet = BRIEFING_SURFACE_STATES.filter(state => !derived.has(state))
    expect([...notServedYet].sort()).toEqual(
      ['connected_not_synced', 'error', 'permission_denied', 'stale', 'syncing'].sort(),
    )
  })
})
