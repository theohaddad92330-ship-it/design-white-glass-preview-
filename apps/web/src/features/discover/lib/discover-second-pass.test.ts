import { describe, expect, it } from 'vitest'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverCandidate, DiscoverResponse } from './discover-types'
import { mergeSecondPass, needsSecondPass, secondPassScope } from './discover-second-pass'

// #4305 — la recherche en deux temps : le second passage part seul quand le premier a été coupé par son
// budget de temps, complète la liste, et ne la remplace jamais.
const registry: DiscoverRequest = { mode: 'registry', query: { filters: { nafCode: '47.91A' }, limit: 24 } }
const signals: DiscoverRequest = { mode: 'signals', query: { sources: ['tender'], sinceDays: 30, limit: 24 } }

const candidate = (siren: string) => ({ siren, name: `SOC ${siren}` }) as unknown as DiscoverCandidate
const response = (sirens: string[], degraded: DiscoverResponse['degraded'] = []): DiscoverResponse => ({
  candidates: sirens.map(candidate),
  query: {},
  degraded,
  coverage: null,
})

describe('needsSecondPass', () => {
  it('oui : le registre a été coupé par le budget de temps', () => {
    const cut = response(['1'], [{ source: 'recherche-entreprises', reason: 'time_budget' }])
    expect(needsSecondPass(registry, cut)).toBe(true)
  })

  it('non : une liste complète, ou une panne qui n’est pas un budget de temps', () => {
    expect(needsSecondPass(registry, response(['1']))).toBe(false)
    expect(needsSecondPass(registry, response(['1'], [{ source: 'pappers', reason: 'quota_exceeded' }]))).toBe(false)
  })

  it('non : le budget de temps d’une autre source (offres, modèle) ne manque aucun compte', () => {
    const jobs = response(['1'], [{ source: 'france_travail', reason: 'time_budget' }])
    expect(needsSecondPass(registry, jobs)).toBe(false)
    expect(needsSecondPass(registry, response(['1'], [{ source: 'claude', reason: 'time_budget' }]))).toBe(false)
  })

  it('non : le mode Signaux n’a pas de second passage, ni une réponse absente', () => {
    const cut = response(['1'], [{ source: 'recherche-entreprises', reason: 'time_budget' }])
    expect(needsSecondPass(signals, cut)).toBe(false)
    expect(needsSecondPass(registry, undefined)).toBe(false)
    expect(needsSecondPass(null, cut)).toBe(false)
  })
})

describe('mergeSecondPass', () => {
  it('garde la liste du premier passage en tête et ajoute les seuls comptes nouveaux', () => {
    const { merged, added } = mergeSecondPass(response(['1', '2']), response(['2', '3', '4']))
    expect(merged.candidates.map(c => c.siren)).toEqual(['1', '2', '3', '4'])
    expect(added).toBe(2)
  })

  it('reprend les sources dégradées du second passage (plus fraîches), pas celles du premier', () => {
    const first = response(['1'], [{ source: 'recherche-entreprises', reason: 'time_budget' }])
    const { merged } = mergeSecondPass(first, response(['1', '2']))
    expect(merged.degraded).toEqual([])
  })

  it('un second passage sans compte nouveau n’ajoute rien (added = 0)', () => {
    const { merged, added } = mergeSecondPass(response(['1']), response(['1']))
    expect(added).toBe(0)
    expect(merged.candidates).toHaveLength(1)
  })
})

describe('#4419.4 — une recherche par compétence coupée par le délai a son second passage', () => {
  const skillCut = (deadlineCut: boolean): DiscoverResponse => ({
    ...response(['1']),
    query: {
      skillSearch: {
        skills: ['Java'],
        offersSeen: 40,
        employersFound: 1,
        unresolvedEmployers: 0,
        intermediaries: 0,
        notAttempted: deadlineCut ? 30 : 0,
        deadlineCut,
      },
    },
  })

  it('oui quand le service dit `deadlineCut`, non sinon', () => {
    expect(needsSecondPass(registry, skillCut(true))).toBe(true)
    expect(needsSecondPass(registry, skillCut(false))).toBe(false)
  })

  it('les compteurs affichés sont ceux du second passage (plus récents), la liste du premier reste en tête', () => {
    const second = { ...skillCut(false), candidates: ['1', '2'].map(candidate) }
    const { merged, added } = mergeSecondPass(skillCut(true), second)
    expect(added).toBe(1)
    expect(merged.candidates.map(c => c.siren)).toEqual(['1', '2'])
    expect((merged.query.skillSearch as { deadlineCut: boolean }).deadlineCut).toBe(false)
  })
})

// #4305 — la contrainte se lit : ce qui est déjà cherché, ce qui reste. Jamais un compteur de crédits, jamais « 0 ».
describe('secondPassScope', () => {
  it('liste coupée : les comptes déjà là, et « la suite de la liste » à chercher', () => {
    const cut = response(['1', '2', '3'], [{ source: 'recherche-entreprises', reason: 'time_budget' }])
    expect(secondPassScope(cut)).toEqual({ shown: 3, listRemains: true, employersRemain: null, completing: false })
  })

  it('recherche par compétence coupée : le nombre d’employeurs non lus', () => {
    const cut: DiscoverResponse = {
      ...response(['1']),
      query: {
        skillSearch: {
          skills: ['Java'],
          offersSeen: 4,
          unresolvedEmployers: 0,
          employersFound: 1,
          intermediaries: 0,
          deadlineCut: true,
          notAttempted: 7,
        },
      },
    }
    expect(secondPassScope(cut)).toEqual({ shown: 1, listRemains: false, employersRemain: 7, completing: false })
  })

  it('une absence n’est jamais « 0 » : aucun compte, aucun employeur non lu → null', () => {
    const cut = response([], [{ source: 'pappers', reason: 'time_budget' }])
    expect(secondPassScope(cut)).toEqual({ shown: null, listRemains: true, employersRemain: null, completing: false })
  })

  it('la garde dit NON : une liste complète n’a rien « à chercher »', () => {
    expect(secondPassScope(response(['1']))).toEqual({
      shown: 1,
      listRemains: false,
      employersRemain: null,
      completing: false,
    })
    expect(secondPassScope(undefined)).toBeNull()
  })
})
