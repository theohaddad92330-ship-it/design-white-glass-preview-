import { describe, expect, it } from 'vitest'
import type { ContactListItem } from '@bellum/contracts'
import type { DiscoverCandidate } from './discover-types'
import {
  applyRailConstraints,
  countActiveFilters,
  decisionLevelImpact,
  emptyUnifiedFilters,
  filterContactRowsByDecisionLevel,
  knownContactLevelsByCompany,
} from './discover-filters'
import { contactRowsFrom } from './discover-contact-rows'

/**
 * #3528.3 (décision Louis 02/10/2026) — le filtre « niveau de décision » du
 * rail Découvrir : ne garder que les comptes ayant AU MOINS UN contact connu
 * du niveau visé (C-level / direction / manager), d'après l'intitulé déjà
 * collecté. Sans contact connu, le compte ne passe pas — rien d'inventé.
 */
const account = (name: string): DiscoverCandidate =>
  ({ siren: name, name, signals: [] }) as unknown as DiscoverCandidate
const contact = (company: string, title: string | null): ContactListItem =>
  ({ id: `${company}-${title}`, company_name: company, title, decision_role: null }) as unknown as ContactListItem

const CONTACTS = [
  contact('Acme SAS', 'Directeur des systèmes d’information'),
  contact('Globex', 'Chief Technology Officer'),
  contact('Initech', 'Responsable infrastructure'),
  contact('Umbrella', null),
]
const ALL = [account('Acme'), account('Globex'), account('Initech'), account('Umbrella'), account('Hooli')]
const run = (levels: ('c_level' | 'n1' | 'n2')[]) =>
  applyRailConstraints(
    ALL,
    { ...emptyUnifiedFilters(), decisionLevels: levels },
    'registry',
    Date.now(),
    knownContactLevelsByCompany(CONTACTS),
  ).map(c => c.name)

describe('filtre niveau de décision (#3528.3)', () => {
  it('ne contraint rien quand aucun niveau n’est coché', () => {
    expect(run([])).toEqual(['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli'])
  })

  it('garde les comptes dont un contact connu est du niveau visé', () => {
    expect(run(['c_level'])).toEqual(['Globex'])
    expect(run(['n1'])).toEqual(['Acme'])
    expect(run(['n2'])).toEqual(['Initech'])
    expect(run(['c_level', 'n2'])).toEqual(['Globex', 'Initech'])
  })

  it('écarte un compte sans contact connu, ou dont le niveau est indéterminé — rien d’inventé', () => {
    expect(run(['c_level', 'n1', 'n2'])).not.toContain('Hooli')
    expect(run(['c_level', 'n1', 'n2'])).not.toContain('Umbrella')
  })

  it('sans table de contacts chargée, un niveau coché ne garde aucun compte', () => {
    const out = applyRailConstraints(ALL, { ...emptyUnifiedFilters(), decisionLevels: ['n1'] }, 'registry')
    expect(out).toEqual([])
  })

  it('compte comme filtre actif', () => {
    expect(countActiveFilters({ ...emptyUnifiedFilters(), decisionLevels: ['n1'] })).toBe(
      countActiveFilters(emptyUnifiedFilters()) + 1,
    )
  })
})

describe('X37 / #3528.3 — le filtre agit aussi sur les CONTACTS rendus', () => {
  const rows = contactRowsFrom(CONTACTS as never)
  const names = (levels: ('c_level' | 'n1' | 'n2')[]) =>
    filterContactRowsByDecisionLevel(rows, levels).map(row => row.company)

  it('rien coché : tous les contacts restent', () => {
    expect(names([])).toHaveLength(CONTACTS.length)
  })

  it('un niveau coché ne garde que les contacts de CE niveau', () => {
    expect(names(['c_level'])).toEqual(['Globex'])
    expect(names(['c_level', 'n2'])).toEqual(['Globex', 'Initech'])
  })

  it('un contact dont le niveau est indéterminable ne passe pas — rien d’inventé', () => {
    expect(names(['c_level', 'n1', 'n2'])).not.toContain('Umbrella')
  })
})

describe('#3528 (recette 03/10) — l’écran dit pourquoi le filtre vide la liste', () => {
  const known = knownContactLevelsByCompany(CONTACTS)
  const impact = (levels: ('c_level' | 'n1' | 'n2')[], k = known) =>
    decisionLevelImpact(ALL, { ...emptyUnifiedFilters(), decisionLevels: levels }, 'registry', Date.now(), k)

  it('aucun niveau coché : rien à dire (null, jamais « 0 écarté »)', () => {
    expect(impact([])).toBeNull()
  })

  it('compte les comptes écartés — ceux sans contact du niveau visé', () => {
    // 5 comptes, seul Globex a un C-level connu : 4 écartés.
    expect(impact(['c_level'])).toEqual({ removedCount: 4 })
  })

  it('un niveau que personne ne porte écarte tout, et le dit', () => {
    expect(impact(['c_level'], knownContactLevelsByCompany([]))).toEqual({ removedCount: 5 })
  })

  it('ne compte que CE filtre : un compte déjà exclu ailleurs n’est pas attribué au niveau', () => {
    const out = decisionLevelImpact(
      ALL,
      { ...emptyUnifiedFilters(), decisionLevels: ['c_level'], excludeSectors: [] },
      'registry',
      Date.now(),
      known,
    )
    expect(out?.removedCount).toBe(4)
  })
})
