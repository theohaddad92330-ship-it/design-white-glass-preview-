import { describe, expect, it } from 'vitest'

import { normalizeDiscoverResponse } from './discover-normalize'
import { splitDegraded, unverifiableReasons } from './discover-coverage'

/**
 * « Détectée mais jamais regardée » ≠ « regardée et écartée ».
 *
 * La résolution SIREN de `/discover/signals` est bornée (elle DOIT l'être :
 * l'API coupe à 45 s et 120 résolutions coûtent 85-144 s de file d'attente).
 * Ce qui tombe sous la borne n'a reçu AUCUN verdict. Le rendre dans le bandeau
 * ambre « une source est tombée », à côté des homonymies, affirmerait un
 * jugement qu'on n'a jamais porté — la faute de #631 dans un autre costume.
 */
describe('couverture Découvrir — non examiné vs examiné puis rejeté', () => {
  const response = {
    candidates: [],
    query: {},
    degraded: [
      { source: 'siren-resolution', reason: '12 homonymies', count: 12, kind: 'ambiguous' },
      { source: 'siren-resolution', reason: '3 non vérifiées', count: 3, kind: 'unreachable' },
      { source: 'siren-resolution', reason: '86 non examinées', count: 86, kind: 'not-examined' },
      { source: 'pappers', reason: 'HTTP 503' },
    ],
    coverage: {
      candidatesFound: 126,
      resolutionsAttempted: 40,
      resolved: 25,
      rejectedAmbiguous: 12,
      rejectedUnreachable: 3,
      notExamined: 86,
      stoppedOn: 'max-resolutions',
      resolveOffset: 0,
      hasMore: true,
    },
  }

  it('lit le bloc coverage renvoyé par l’IA', () => {
    const { coverage } = normalizeDiscoverResponse(response)
    expect(coverage).toEqual({
      candidatesFound: 126,
      resolutionsAttempted: 40,
      resolved: 25,
      rejectedAmbiguous: 12,
      rejectedUnreachable: 3,
      notExamined: 86,
      stoppedOn: 'max-resolutions',
      resolveOffset: 0,
      hasMore: true,
      // #4319 (lot DEC-B) — les entreprises détectées non identifiées, par leur nom ; aucune ici.
      notIdentifiedNames: [],
    })
  })

  it('sort les non-examinées du bandeau des pannes', () => {
    const { degraded } = normalizeDiscoverResponse(response)
    const { faults, notExamined } = splitDegraded(degraded)

    expect(notExamined?.count).toBe(86)
    // Le bandeau ambre ne parle QUE de ce qui est réellement TOMBÉ.
    //
    // ⚠️ Cette ligne attendait TROIS entrées jusqu'au 09/09/2026 — la deuxième
    // était l'homonymie non tranchée. Elle épinglait un ÉTAT, pas une règle :
    // le jour où on a séparé « je n'ai pas su trancher » de « la source est
    // tombée » (#1766), la garde est devenue rouge en refusant une correction.
    // On la corrige donc AVEC la règle qu'elle protège, et l'assertion voisine
    // ci-dessous prouve que l'information n'est pas perdue pour autant.
    expect(faults.map(f => f.source)).toEqual(['siren-resolution', 'pappers'])
    expect(faults.some(f => f.kind === 'not-examined')).toBe(false)
    expect(faults.some(f => f.kind === 'ambiguous')).toBe(false)
  })

  /**
   * #1766 — UNE HOMONYMIE NON TRANCHÉE N'EST PAS UNE PANNE.
   *
   * « Plusieurs entités portent ce nom » est un verdict rendu sur la DONNÉE : le
   * registre a répondu, et il a même répondu plusieurs fois. Peint en ambre à
   * côté d'un quota épuisé, il faisait dire au bandeau « une source n'a pas pu
   * répondre » — faux dans les deux moitiés.
   */
  it('sort aussi les homonymies du bandeau des pannes, sans les perdre', () => {
    const { degraded } = normalizeDiscoverResponse(response)
    const { faults, ambiguities } = splitDegraded(degraded)

    expect(ambiguities.map(a => a.count)).toEqual([12])
    // La panne registre (`unreachable`) reste, elle, une panne.
    expect(faults.map(f => f.kind ?? 'absent')).toEqual(['unreachable', 'absent'])
  })

  /**
   * Ce qui empêche de CONCLURE — la dérivation que l'écran consulte deux fois
   * (masquer le bandeau, choisir l'état vide). Deux calculs séparés auraient
   * divergé, et les deux se seraient à nouveau affichés ensemble.
   */
  it('réunit pannes ET homonymies sous « on n’a rien pu vérifier »', () => {
    const { degraded } = normalizeDiscoverResponse(response)
    const reasons = unverifiableReasons(splitDegraded(degraded))

    expect(reasons.map(r => r.source)).toEqual(['siren-resolution', 'pappers', 'siren-resolution'])
    // Ni la borne de couverture, ni une limite de capacité : ni l'une ni
    // l'autre n'empêche de conclure.
    expect(reasons.some(r => r.kind === 'not-examined' || r.kind === 'capability')).toBe(false)
  })

  it('sans rien de cassé ni d’ambigu, il n’y a RIEN à dire — la liste est vide', () => {
    const { degraded } = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [
        { source: 'pappers', reason: 'no_match', kind: 'no-match' },
        { source: 'siren-resolution', reason: '86 non examinées', count: 86, kind: 'not-examined' },
      ],
    })
    expect(unverifiableReasons(splitDegraded(degraded))).toEqual([])
  })

  it('une réponse sans coverage reste exploitable (ancien backend)', () => {
    const { coverage, degraded } = normalizeDiscoverResponse({ candidates: [], query: {}, degraded: [] })
    expect(coverage).toBeNull()
    expect(splitDegraded(degraded).notExamined).toBeNull()
  })

  it('sans coverage mais avec l’entrée degraded, l’info n’est PAS perdue', () => {
    // Garde-fou de déploiement : si le web arrive avant l’IA (ou l’inverse),
    // l’utilisateur doit quand même apprendre qu’il manque des entreprises.
    const { degraded } = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [{ source: 'siren-resolution', reason: '86 non examinées', count: 86, kind: 'not-examined' }],
    })
    expect(splitDegraded(degraded).notExamined?.count).toBe(86)
  })

  it('un compteur négatif ou absurde est ignoré plutôt qu’affiché', () => {
    const { coverage } = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [],
      coverage: { candidatesFound: -5, notExamined: 'beaucoup' },
    })
    expect(coverage?.candidatesFound).toBe(0)
    expect(coverage?.notExamined).toBe(0)
  })

  /**
   * #2165.28 / #2165.30 — UN FILTRE SUR DONNÉE INCONNUE N'EST PAS UNE PANNE.
   *
   * Doctrine c65 (GA-259) : un compte dont la mémoire marché n'a pas de
   * donnée n'est jamais « exclu en silence » ni « il ne correspond pas ». Le
   * bandeau des pannes ne doit ni l'avaler (fail-loud générique) ni le peindre
   * en ambre (ce n'est pas cassé) — il a son propre panier.
   */
  it('sort un filtre serveur sur donnée inconnue du bandeau des pannes, sans le perdre', () => {
    const { degraded } = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [
        { source: 'market-memory', reason: 'market_memory_unmeasured', kind: 'unmeasured', count: 3 },
        { source: 'pappers', reason: 'missing_api_key' },
      ],
    })
    const { faults, unmeasured } = splitDegraded(degraded)

    expect(unmeasured.map(u => u.count)).toEqual([3])
    expect(faults.map(f => f.reason)).toEqual(['missing_api_key'])
  })

  it("un filtre sur donnée inconnue n'entre pas dans « on n’a rien pu vérifier »", () => {
    const { degraded } = normalizeDiscoverResponse({
      candidates: [{ name: 'ACME', siren: '1' } as never],
      query: {},
      degraded: [{ source: 'market-memory', reason: 'market_memory_unmeasured', kind: 'unmeasured', count: 3 }],
    })
    expect(unverifiableReasons(splitDegraded(degraded))).toEqual([])
  })
})

describe('offres d’emploi — différé vs tombé (#3901)', () => {
  it('une source d’offres différée (time_budget) n’est ni une panne ni un obstacle', () => {
    const split = splitDegraded([{ source: 'france_travail', reason: 'time_budget' }])
    expect(split.faults).toEqual([])
    expect(split.jobsFaults).toEqual([])
    expect(unverifiableReasons(split)).toEqual([])
  })

  it('une source d’offres en vraie panne a son seau, hors des pannes de liste', () => {
    const split = splitDegraded([
      { source: 'france_travail', reason: 'upstream_error' },
      { source: 'pappers', reason: 'quota_exceeded' },
    ])
    expect(split.jobsFaults.map(e => e.source)).toEqual(['france_travail'])
    expect(split.faults.map(e => e.source)).toEqual(['pappers'])
    expect(unverifiableReasons(split).map(e => e.source)).toEqual(['pappers'])
  })
})

/** DISCOVER-PARTIEL-2 (16/10) — les sources qui garnissent une CARTE n'enlèvent aucune entreprise. */
describe('couverture Découvrir — sources de cartes (marchés publics, annonces, ATS)', () => {
  it('une source de cartes dont on a cessé d’attendre n’est ni une panne ni une ligne', () => {
    const split = splitDegraded([
      { source: 'boamp', reason: 'time_budget' },
      { source: 'eu_tenders', reason: 'time_budget' },
    ])
    expect(split.faults).toEqual([])
    expect(split.cardFaults).toEqual([])
  })

  it('une source de cartes vraiment tombée a son seau, pas le bandeau « liste incomplète »', () => {
    const split = splitDegraded([
      { source: 'eu_tenders', reason: 'rate_limited' },
      { source: 'boamp', reason: 'upstream_error' },
    ])
    expect(split.faults).toEqual([])
    expect(split.cardFaults.map(e => e.source)).toEqual(['eu_tenders', 'boamp'])
  })

  it('le registre qui produit la liste reste une panne, sous sa propre famille', () => {
    const split = splitDegraded([
      { source: 'recherche-entreprises', reason: 'rate_limited' },
      { source: 'recherche-entreprises', reason: 'time_budget' },
    ])
    expect(split.faults.map(e => e.reason)).toEqual(['rate_limited', 'time_budget'])
    expect(split.cardFaults).toEqual([])
  })
})
