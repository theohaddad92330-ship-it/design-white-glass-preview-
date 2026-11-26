import { describe, expect, it } from 'vitest'

import { normalizeDiscoverResponse } from './discover-normalize'
import { splitDegraded } from './discover-coverage'
import { unappliedFilters, unnamedCapabilities } from './discover-capability'

/**
 * « Le registre n'a pas su exprimer ce filtre » ≠ « le registre est tombé ».
 *
 * L'écran rendait les deux dans le même bandeau ambre « ⚠ Résultats partiels —
 * une ou plusieurs sources n'ont pas répondu ». Pour `unsupported_filters`, les
 * trois affirmations sont fausses : Pappers a répondu (c'est lui qui a fourni
 * les 24 lignes), la liste n'est pas incomplète — elle est plus LARGE —, et
 * aucun candidat ne manque.
 *
 * Le tri se fait sur `kind`, un champ MACHINE (précédent #649), jamais sur la
 * lecture d'une phrase française. Défaut fail-loud : pas de `kind` = panne.
 */
describe('Découvrir — limite de capacité vs panne', () => {
  const response = {
    candidates: [],
    query: {},
    degraded: [
      { source: 'pappers', reason: 'unsupported_filters', kind: 'capability', fields: ['sector'] },
      { source: 'pappers', reason: 'no_match', kind: 'no-match' },
      { source: 'recherche-entreprises', reason: 'quota_exceeded' },
    ],
  }

  it('range chaque entrée dans sa famille', () => {
    const { degraded } = normalizeDiscoverResponse(response)
    const { faults, capabilities } = splitDegraded(degraded)

    // Seule la panne reste dans le chemin bruyant.
    expect(faults).toEqual([{ source: 'recherche-entreprises', reason: 'quota_exceeded' }])
    expect(capabilities.map(c => c.reason)).toEqual(['unsupported_filters'])
  })

  it('une source qui n’a rien trouvé n’est ni une panne ni une limite', () => {
    // Cas COURANT du waterfall : Pappers ne matche rien, gouv.fr rend 24 lignes.
    // Peindre ça en ambre faisait du bandeau un bruit permanent.
    const { degraded } = normalizeDiscoverResponse(response)
    const { faults, capabilities } = splitDegraded(degraded)

    expect([...faults, ...capabilities].some(e => e.reason === 'no_match')).toBe(false)
  })

  it('une raison inconnue reste une PANNE — sous-alerter coûte plus cher', () => {
    const { degraded } = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [{ source: 'pappers', reason: 'some_future_reason' }],
    })
    expect(splitDegraded(degraded).faults).toHaveLength(1)
  })

  it('ne se fie JAMAIS au texte de la raison pour cadrer une entrée', () => {
    // Une panne dont la raison contient le mot « filters » reste une panne :
    // c'est `kind` qui décide, pas la prose.
    const { degraded } = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: [{ source: 'pappers', reason: 'unsupported_filters (timeout)' }],
    })
    expect(splitDegraded(degraded).faults).toHaveLength(1)
    expect(splitDegraded(degraded).capabilities).toHaveLength(0)
  })
})

describe('Découvrir — à QUEL filtre rattacher la note', () => {
  const capability = (fields?: string[]) => [
    { source: 'pappers', reason: 'unsupported_filters', kind: 'capability', ...(fields ? { fields } : {}) },
  ]

  it('rattache le critère non honoré au champ d’écran correspondant', () => {
    const { degraded } = normalizeDiscoverResponse({ candidates: [], query: {}, degraded: capability(['sector']) })
    const { capabilities } = splitDegraded(degraded)

    expect([...unappliedFilters(capabilities).entries()]).toEqual([['sector', ['pappers']]])
  })

  it('gère plusieurs critères d’un coup', () => {
    const { degraded } = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: capability(['sector', 'city']),
    })
    const map = unappliedFilters(splitDegraded(degraded).capabilities)

    expect([...map.keys()].sort()).toEqual(['city', 'sector'])
  })

  it('ignore un critère qui ne correspond à aucun contrôle de l’écran', () => {
    // `revenue_min` est un critère du registre gouv.fr, pas un champ de
    // Découvrir : lui fabriquer un libellé serait inventer un filtre que
    // l'utilisateur n'a jamais posé.
    const { degraded } = normalizeDiscoverResponse({
      candidates: [],
      query: {},
      degraded: capability(['revenue_min']),
    })
    const { capabilities } = splitDegraded(degraded)

    expect(unappliedFilters(capabilities).size).toBe(0)
    // …mais l'information n'est pas PERDUE pour autant.
    expect(unnamedCapabilities(capabilities)).toHaveLength(1)
  })

  it('une entrée sans `fields` n’invente pas de champ mais reste dite', () => {
    const { degraded } = normalizeDiscoverResponse({ candidates: [], query: {}, degraded: capability() })
    const { capabilities } = splitDegraded(degraded)

    expect(unappliedFilters(capabilities).size).toBe(0)
    expect(unnamedCapabilities(capabilities)).toHaveLength(1)
  })

  it('une entrée dont TOUS les critères sont rattachés ne double pas le message', () => {
    const { degraded } = normalizeDiscoverResponse({ candidates: [], query: {}, degraded: capability(['sector']) })
    const { capabilities } = splitDegraded(degraded)

    expect(unnamedCapabilities(capabilities)).toHaveLength(0)
  })
})
