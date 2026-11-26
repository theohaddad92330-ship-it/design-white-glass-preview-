import { describe, expect, it } from 'vitest'
import { DISCOVER_QUICK_PASS_MAX_ACCOUNTS, discoverQuickPassResultSchema } from '@bellum/contracts'
import { discoverQuickPass, discoverQuickPassEntry } from './discover-quick-pass'
import type { DiscoverCandidate } from './discover-types'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 50,
    scoreMax: 70,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

const REVIEWED_AT = '2026-09-21T10:00:00.000Z'

// #2630.1 — la passe rapide LIT ce que la recherche a déjà ramené. Aucune de ces
// assertions ne devient vraie par une collecte : si elle demandait une donnée
// neuve, elle serait fausse pour les vingt comptes à la fois.
describe('#2630.1 — la passe rapide sur ce qu’une recherche a déjà ramené', () => {
  it('rend une entrée par compte, et le résultat respecte le contrat partagé', () => {
    const result = discoverQuickPass([candidate({ siren: '1' }), candidate({ siren: '2' })], REVIEWED_AT)
    expect(result.entries).toHaveLength(2)
    expect(discoverQuickPassResultSchema.parse(result)).toBeTruthy()
  })

  it('BORNE la passe à vingt comptes, même sur une recherche plus large', () => {
    const many = Array.from({ length: 25 }, (_, index) => candidate({ siren: String(100000000 + index) }))
    const result = discoverQuickPass(many, REVIEWED_AT)
    expect(result.entries).toHaveLength(DISCOVER_QUICK_PASS_MAX_ACCOUNTS)
    // Les vingt PREMIERS de la liste reçue — elle est déjà triée par le tri actif.
    expect(result.entries[0]?.siren).toBe('100000000')
    expect(result.entries.at(-1)?.siren).toBe(String(100000000 + DISCOVER_QUICK_PASS_MAX_ACCOUNTS - 1))
  })

  it('un signal NON CHERCHÉ sort l’axe du dénominateur — il ne compte pas zéro', () => {
    const [entry] = discoverQuickPass([candidate({ signals: [], signalsSearched: false })], REVIEWED_AT).entries
    expect(entry?.unevaluableAxes).toContain('signal')
    expect(entry?.attentionAxes).not.toContain('signal')
  })

  it('un signal CHERCHÉ sans résultat est une MESURE, pas un silence', () => {
    const [entry] = discoverQuickPass([candidate({ signals: [], signalsSearched: true })], REVIEWED_AT).entries
    expect(entry?.evaluatedAxes).toContain('signal')
    expect(entry?.attentionAxes).toContain('signal')
  })

  it('l’absence de clé `people` n’est pas « aucun contact » — l’axe sort du dénominateur', () => {
    const [absent] = discoverQuickPass([candidate({})], REVIEWED_AT).entries
    expect(absent?.unevaluableAxes).toContain('named_contact')

    const [collected] = discoverQuickPass([candidate({ people: [] })], REVIEWED_AT).entries
    expect(collected?.evaluatedAxes).toContain('named_contact')
  })

  it('un score ABSENT interdit tout verdict — jamais un « prudence » par défaut', () => {
    const [entry] = discoverQuickPass([candidate({ score: null, scoreMax: null })], REVIEWED_AT).entries
    expect(entry?.verdict).toBeNull()
    expect(entry?.unevaluableDecisiveAxes).toEqual(['interest'])
  })

  it('l’accès vient de la dérivation UNIQUE du dépôt, pas d’une seconde ici (GA-26)', () => {
    const served = candidate({
      signals: [{ type: 'award', label: 'Marché attribué', date: '2026-06-01', detail: 'Titulaire : un concurrent' }],
      signalsSearched: true,
    })
    const [entry] = discoverQuickPass([served], REVIEWED_AT).entries
    const axis = entry?.axes.find(item => item.axis === 'access')
    expect(axis?.measured).toEqual({ accessLevel: 'rang3_plus' })
    // ⚠️ Un état d'accès défavorable est une RÉSERVE, jamais un refus.
    expect(entry?.blockingAxes).not.toContain('access')
  })
})

// #3597.3 — le verdict devient un badge SUR LA LIGNE : une entrée par compte,
// calculée par la même fonction que la passe de vingt (calcul inchangé).
describe('#3597.3 — l’entrée d’un seul compte', () => {
  it('donne la même entrée que la passe sur vingt comptes', () => {
    const one = candidate({ siren: '7', score: 65, scoreMax: 70, signalsSearched: true, people: [], signals: [] })
    const [fromPass] = discoverQuickPass([one], REVIEWED_AT).entries
    expect(discoverQuickPassEntry(one)).toEqual(fromPass)
  })

  it('un compte sans score n’a pas de verdict — le badge sera absent', () => {
    expect(discoverQuickPassEntry(candidate({ score: null, scoreMax: null })).verdict).toBeNull()
  })
})
