import { describe, expect, it } from 'vitest'
import {
  emptyMissionFilterState,
  missionFiltersToSavedRecord,
  savedRecordToMissionFilters,
  type MissionFilterState,
} from './mission-saved-view-filters'

/**
 * #2408.54 — LES VUES ENREGISTRÉES DE « MISSIONS ».
 *
 * `SAVED_VIEW_SCOPES` porte déjà `'missions'` (`governance.ts`) et le serveur
 * (`GET/POST/DELETE /governance/views`) est déjà générique par `scope` —
 * aucun appelant web ne l'utilisait pour cet écran : le motif exact que
 * CLAUDE.md nomme « du code juste, calculé, testé, que personne n'appelle ».
 *
 * Ces filtres sont CLIENT (`filters.ts` : « le filtre est CLIENT, et il a le
 * droit de l'être ici »), donc il n'existe aucun `MissionSearchQuery` de
 * contrat à réutiliser — le module valide chaque clé contre les énumérations
 * du contrat lui-même (`MISSION_FACETS`, `missionStatusSchema`,
 * `contractKindSchema`, `renewalWindowSchema`), jamais une liste recopiée.
 */
describe('missionFiltersToSavedRecord', () => {
  it('rend {} quand rien n’est filtré — le serveur refuse une vue sans critère', () => {
    expect(missionFiltersToSavedRecord(emptyMissionFilterState())).toEqual({})
  })

  it('garde la recherche et les facettes cochées', () => {
    const record = missionFiltersToSavedRecord({
      ...emptyMissionFilterState(),
      query: 'kubernetes',
      facets: ['toRenew', 'withRisk'],
    })
    expect(record).toEqual({ query: 'kubernetes', facets: ['toRenew', 'withRisk'] })
  })

  it('garde chaque filtre à énumération et chaque filtre à nom résolu', () => {
    const state: MissionFilterState = {
      query: '',
      facets: [],
      status: ['active'],
      contractKind: ['regie'],
      owner: ['Camille Aubert'],
      account: ['Société Générale'],
      consultant: ['Yanis Cordier'],
      endWindow: ['j30'],
      channel: ['partner'],
      currency: ['CHF'],
      businessUnit: [],
    }
    expect(missionFiltersToSavedRecord(state)).toEqual({
      status: ['active'],
      contractKind: ['regie'],
      owner: ['Camille Aubert'],
      account: ['Société Générale'],
      consultant: ['Yanis Cordier'],
      endWindow: ['j30'],
      channel: ['partner'],
      currency: ['CHF'],
    })
  })
})

describe('savedRecordToMissionFilters', () => {
  it('relit un enregistrement valide tel quel', () => {
    const state = savedRecordToMissionFilters({ query: 'kubernetes', facets: ['noEndDate'], status: 'active' })
    expect(state).toEqual({
      ...emptyMissionFilterState(),
      query: 'kubernetes',
      facets: ['noEndDate'],
      status: ['active'],
    })
  })

  it('Théo — une vue enregistrée AVANT la multi-sélection (valeur simple) se relit comme une liste d’un élément', () => {
    expect(savedRecordToMissionFilters({ status: 'active', account: 'Société Générale' })).toEqual({
      ...emptyMissionFilterState(),
      status: ['active'],
      account: ['Société Générale'],
    })
  })

  it('Théo — plusieurs valeurs par filtre s’enregistrent et se relisent', () => {
    const state: MissionFilterState = { ...emptyMissionFilterState(), status: ['active', 'at_risk'], owner: ['A', 'B'] }
    expect(missionFiltersToSavedRecord(state)).toEqual({ status: ['active', 'at_risk'], owner: ['A', 'B'] })
    expect(savedRecordToMissionFilters(missionFiltersToSavedRecord(state))).toEqual(state)
  })

  it('un enregistrement illisible (forme abîmée) relit un filtre VIDE, jamais une erreur', () => {
    expect(savedRecordToMissionFilters(null)).toEqual(emptyMissionFilterState())
    expect(savedRecordToMissionFilters('texte')).toEqual(emptyMissionFilterState())
  })

  it('une valeur d’énumération disparue du contrat relit « pas de critère », jamais une exception', () => {
    const state = savedRecordToMissionFilters({
      status: 'valeur-disparue-du-contrat',
      endWindow: 'jamais-vu',
      channel: 'canal-disparu',
    })
    expect(state.status).toEqual([])
    expect(state.endWindow).toEqual([])
    expect(state.channel).toEqual([])
  })

  it('une facette inconnue est ignorée, les autres survivent', () => {
    const state = savedRecordToMissionFilters({ facets: ['withRisk', 'facette-disparue'] })
    expect(state.facets).toEqual(['withRisk'])
  })

  it('aller-retour : ce qu’on enregistre se relit à l’identique', () => {
    const original: MissionFilterState = {
      query: 'devops',
      facets: ['toRenew', 'marginAtRisk'],
      status: ['onboarding'],
      contractKind: ['forfait'],
      owner: ['Camille Aubert'],
      account: [],
      consultant: [],
      endWindow: ['overdue'],
      channel: ['partner'],
      currency: ['EUR'],
      businessUnit: ['Agence Lyon'],
    }
    const record = missionFiltersToSavedRecord(original)
    expect(savedRecordToMissionFilters(record)).toEqual(original)
  })

  /**
   * #2408.53 — LA DEVISE, un ensemble OUVERT (ISO 4217) : validée par
   * `knownString`, comme `owner`/`account`/`consultant`, jamais par une
   * énumération de contrat qui n'existe pas pour une devise.
   */
  it('#2408.53 — une devise enregistrée relit la même devise', () => {
    const record = missionFiltersToSavedRecord({ ...emptyMissionFilterState(), currency: ['CHF'] })
    expect(record).toEqual({ currency: ['CHF'] })
    expect(savedRecordToMissionFilters(record).currency).toEqual(['CHF'])
  })

  it('#2408.53 — une devise illisible (pas une chaîne) relit « pas de critère »', () => {
    expect(savedRecordToMissionFilters({ currency: 42 }).currency).toEqual([])
    expect(savedRecordToMissionFilters({ currency: '' }).currency).toEqual([])
  })

  it('#2408.39 — une BU enregistrée relit la même BU ; illisible = « pas de critère »', () => {
    const record = missionFiltersToSavedRecord({ ...emptyMissionFilterState(), businessUnit: ['Agence Lyon'] })
    expect(record).toEqual({ businessUnit: ['Agence Lyon'] })
    expect(savedRecordToMissionFilters(record).businessUnit).toEqual(['Agence Lyon'])
    expect(savedRecordToMissionFilters({ businessUnit: 42 }).businessUnit).toEqual([])
    expect(savedRecordToMissionFilters({ businessUnit: '' }).businessUnit).toEqual([])
  })

  /**
   * #2408.62 — LA VUE « Partenaires/rang 2 » elle-même n'a besoin d'AUCUN
   * code dédié : le canal `partner` enregistré ici EST cette vue, exactement
   * comme .56/.59/.61 se sont résolus par le même mécanisme (#2408.54,
   * LOT g6 du 26/09) — l'utilisateur clique le filtre « Canal » puis
   * l'enregistre lui-même sous le nom qu'il veut.
   */
  it('#2408.62 — un canal enregistré relit le même canal, pas de mécanisme séparé', () => {
    const record = missionFiltersToSavedRecord({ ...emptyMissionFilterState(), channel: ['partner'] })
    expect(record).toEqual({ channel: ['partner'] })
    expect(savedRecordToMissionFilters(record).channel).toEqual(['partner'])
  })
})
