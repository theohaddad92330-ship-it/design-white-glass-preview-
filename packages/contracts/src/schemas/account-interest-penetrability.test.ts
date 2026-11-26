import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_INTEREST_FACTOR_KEYS,
  ACCOUNT_PENETRABILITY_FACTOR_KEYS,
  deriveAccountInterestPenetrability,
  simulateAccountInterestPenetrability,
  summarizeAccountInterestPenetrabilityPortfolio,
  type AccountInterestPenetrabilityInput,
  type AccountInterestPenetrabilityPortfolio,
} from './account-interest-penetrability.js'
import type { AccountAnalysis } from './analysis/account-analysis.js'
import { missingElement, knownElement } from './account-strategy-5p-elements.js'
import type { AccountStrategy5P } from './account-strategy-5p.js'

function emptyStrategy5P(): Pick<AccountStrategy5P, 'perimeter' | 'people' | 'passage' | 'proof'> {
  return {
    perimeter: {
      group: missingElement(),
      parent_company: missingElement(),
      subsidiary: missingElement(),
      business_unit: missingElement(),
      direction: missingElement(),
      site: missingElement(),
      team: missingElement(),
      program: missingElement(),
      project: missingElement(),
      selected_scope: missingElement(),
      excluded_scopes: missingElement(),
      budget_scope: missingElement(),
      confidence: 'low',
    },
    people: {
      users: missingElement(),
      operational_relays: missingElement(),
      champions: missingElement(),
      technical_references: missingElement(),
      sponsors: missingElement(),
      economic_deciders: missingElement(),
      procurement: missingElement(),
      blockers: missingElement(),
      known_relationships: missingElement(),
      missing_roles: missingElement(),
    },
    passage: {
      current_consultant: missingElement(),
      former_consultant: missingElement(),
      former_colleague: missingElement(),
      common_relationship: missingElement(),
      existing_client: missingElement(),
      partner: missingElement(),
      rank_2: missingElement(),
      referenced_esn: missingElement(),
      former_manager: missingElement(),
      alumni: missingElement(),
      event: missingElement(),
      direct_recommendation: missingElement(),
      no_path: missingElement(),
      confidence: 'low',
    },
    proof: {
      relevant_consultant: missingElement(),
      comparable_reference: missingElement(),
      mission_rex: missingElement(),
      client_case: missingElement(),
      artifact: missingElement(),
      benchmark: missingElement(),
      sector_knowledge: missingElement(),
      relationship_proof: missingElement(),
      risks: missingElement(),
      missing_proof: missingElement(),
      confidence: 'low',
    },
  }
}

function baseInput(overrides: Partial<AccountInterestPenetrabilityInput> = {}): AccountInterestPenetrabilityInput {
  return {
    accountId: '11111111-1111-1111-1111-111111111111',
    analysis: {} as AccountAnalysis,
    strategy5P: emptyStrategy5P(),
    contacts: [],
    partners: [],
    ...overrides,
  }
}

describe('deriveAccountInterestPenetrability', () => {
  it("porte les huit facteurs d'intérêt et les onze de pénétrabilité, toujours nommés", () => {
    const result = deriveAccountInterestPenetrability(baseInput())
    expect(result.interest.factors.map(f => f.key).sort()).toEqual([...ACCOUNT_INTEREST_FACTOR_KEYS].sort())
    expect(result.penetrability.factors.map(f => f.key).sort()).toEqual([...ACCOUNT_PENETRABILITY_FACTOR_KEYS].sort())
  })

  it('une inconnue ne vaut pas zéro — aucune donnée ⇒ bande "insufficient_data", jamais "low"', () => {
    const result = deriveAccountInterestPenetrability(baseInput())
    expect(result.interest.band).toBe('insufficient_data')
    expect(result.penetrability.band).toBe('insufficient_data')
    expect(result.quadrant).toBeNull()
    expect(result.quadrantUnavailableReason).not.toBeNull()
  })

  it('ne fusionne jamais les deux axes dans un score unique — ils varient indépendamment', () => {
    const analysis = {
      qualified_hypotheses: [{ signal: 's', angle: 'a', first_action: 'x' }],
    } as unknown as AccountAnalysis
    const withInterestOnly = deriveAccountInterestPenetrability(
      baseInput({
        analysis: {
          ...analysis,
          it_challenges: [{ challenge: 'x' } as never],
          recent_signals: [{ label: 'x' } as never],
        },
      }),
    )
    // Changer l'intérêt ne bouge jamais la pénétrabilité (toujours insufficient_data ici).
    expect(withInterestOnly.penetrability.band).toBe('insufficient_data')
    expect(withInterestOnly.interest.band).not.toBe('insufficient_data')
    // La forme du résultat ne porte AUCUN champ numérique fusionné.
    expect(Object.keys(withInterestOnly)).not.toContain('score')
    expect(Object.keys(withInterestOnly)).not.toContain('globalScore')
  })

  it("le prestige du logo n'augmente pas automatiquement l'intérêt (aucun facteur ne lit la taille/le CA)", () => {
    const small = deriveAccountInterestPenetrability(baseInput())
    const huge = deriveAccountInterestPenetrability(
      baseInput({ analysis: { employees: '50 000+', revenue: '10 Md€' } as unknown as AccountAnalysis }),
    )
    expect(huge.interest.band).toBe(small.interest.band)
    expect(huge.interest.factors).toEqual(small.interest.factors)
  })

  it('le nombre de contacts ne prouve pas la pénétrabilité (accessibilité = qualité, pas quantité)', () => {
    const manyWeakContacts = deriveAccountInterestPenetrability(
      baseInput({
        contacts: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, email_verified: false })),
      }),
    )
    const factor = manyWeakContacts.penetrability.factors.find(f => f.key === 'people_accessibility')
    expect(factor?.signal).not.toBe('favorable')
  })

  it("un contact vérifié à rôle décisionnaire prouve l'accessibilité des personnes", () => {
    const strategy5P = emptyStrategy5P()
    strategy5P.people.champions = knownElement([{ contactId: 'c1', name: 'Alix' }], 'observed')
    const result = deriveAccountInterestPenetrability(
      baseInput({ strategy5P, contacts: [{ id: 'c1', email_verified: true }] }),
    )
    const factor = result.penetrability.factors.find(f => f.key === 'people_accessibility')
    expect(factor?.signal).toBe('favorable')
  })

  it('un signal actuel ne supprime pas une barrière achats (les deux facteurs restent indépendants)', () => {
    const strategy5P = emptyStrategy5P()
    strategy5P.people.blockers = knownElement([{ contactId: 'b1', name: 'Blocker' }], 'observed')
    const result = deriveAccountInterestPenetrability(
      baseInput({
        analysis: { recent_signals: [{ label: 'levée de fonds' } as never] } as unknown as AccountAnalysis,
        strategy5P,
      }),
    )
    const momentum = result.interest.factors.find(f => f.key === 'current_momentum')
    const barriers = result.penetrability.factors.find(f => f.key === 'purchasing_barriers')
    expect(momentum?.signal).toBe('favorable')
    expect(barriers?.signal).toBe('unfavorable')
  })

  it('une relation ancienne (stale) ne prouve pas un accès actif', () => {
    const strategy5P = emptyStrategy5P()
    strategy5P.passage.common_relationship = { value: 'Ex-collègue de 2014', status: 'stale' }
    const result = deriveAccountInterestPenetrability(baseInput({ strategy5P }))
    const factor = result.penetrability.factors.find(f => f.key === 'existing_relationship')
    expect(factor?.signal).toBeNull()
    expect(factor?.status).toBe('stale')
  })

  it('un partenaire actif et non écarté prouve la pénétrabilité par ce canal', () => {
    const result = deriveAccountInterestPenetrability(
      baseInput({ partners: [{ relationship: 'partner', placements: 2, dismissed_at: null }] }),
    )
    const factor = result.penetrability.factors.find(f => f.key === 'partner_in_place')
    expect(factor?.signal).toBe('favorable')
  })

  it('un partenaire écarté (dismissed) ne compte pas', () => {
    const result = deriveAccountInterestPenetrability(
      baseInput({ partners: [{ relationship: 'partner', placements: 2, dismissed_at: '2026-01-01T00:00:00Z' }] }),
    )
    const factor = result.penetrability.factors.find(f => f.key === 'partner_in_place')
    expect(factor?.signal).not.toBe('favorable')
  })

  it('une filiale/BU précisément identifiée favorise la pénétrabilité ; seul le groupe connu ne la favorise pas', () => {
    const withSubsidiary = emptyStrategy5P()
    withSubsidiary.perimeter.subsidiary = knownElement('Filiale FR', 'observed')
    const favorable = deriveAccountInterestPenetrability(baseInput({ strategy5P: withSubsidiary }))
    expect(favorable.penetrability.factors.find(f => f.key === 'subsidiary_autonomy')?.signal).toBe('favorable')

    const onlyGroup = emptyStrategy5P()
    onlyGroup.perimeter.group = knownElement('Groupe XYZ', 'observed')
    const unfavorable = deriveAccountInterestPenetrability(baseInput({ strategy5P: onlyGroup }))
    expect(unfavorable.penetrability.factors.find(f => f.key === 'subsidiary_autonomy')?.signal).toBe('unfavorable')
  })

  it('les facteurs sans source canonique aujourd’hui restent honnêtement manquants (sales_cycle, relative_size, valeur économique, récurrence, extension)', () => {
    const result = deriveAccountInterestPenetrability(baseInput())
    for (const key of ['sales_cycle', 'relative_size'] as const) {
      expect(result.penetrability.factors.find(f => f.key === key)?.status).toBe('missing')
    }
    for (const key of ['economic_value', 'recurrence_potential', 'extension_potential'] as const) {
      expect(result.interest.factors.find(f => f.key === key)?.status).toBe('missing')
    }
  })
})

describe('simulateAccountInterestPenetrability', () => {
  it('simule "avec partenaire" sans modifier le calcul de base', () => {
    const base = deriveAccountInterestPenetrability(baseInput())
    const simulated = simulateAccountInterestPenetrability(base, { partner_in_place: 'favorable' })
    expect(simulated.penetrability.factors.find(f => f.key === 'partner_in_place')?.signal).toBe('favorable')
    expect(base.penetrability.factors.find(f => f.key === 'partner_in_place')?.signal).not.toBe('favorable')
    expect(simulated.isSimulation).toBe(true)
  })
})

/**
 * #3258.13 (épopée #3362, lot P01) — LA LECTURE PORTEFEUILLE.
 *
 * `summarizeAccountInterestPenetrabilityPortfolio` ne recalcule RIEN : elle
 * compte des `quadrant` déjà posés par `deriveAccountInterestPenetrability`
 * sur chaque compte (GA-26, une seule fonction qui sait lire un quadrant).
 */
describe('summarizeAccountInterestPenetrabilityPortfolio', () => {
  function portfolio(
    entries: AccountInterestPenetrabilityPortfolio['entries'],
    extra: Partial<AccountInterestPenetrabilityPortfolio> = {},
  ): AccountInterestPenetrabilityPortfolio {
    return { entries, totalAccounts: entries.length, truncated: false, ...extra }
  }

  it('compte les quatre quadrants — un quadrant sans compte reste une ligne à zéro, une vraie mesure', () => {
    const summary = summarizeAccountInterestPenetrabilityPortfolio(
      portfolio([
        { accountId: 'a1', companyName: 'Alpha', quadrant: 'priority_now', quadrantUnavailableReason: null },
        { accountId: 'a2', companyName: 'Beta', quadrant: 'priority_now', quadrantUnavailableReason: null },
        { accountId: 'a3', companyName: 'Gamma', quadrant: 'no_go_watch', quadrantUnavailableReason: null },
      ]),
    )
    expect(summary.byQuadrant).toEqual([
      { quadrant: 'priority_now', count: 2 },
      { quadrant: 'strategic_long_road', count: 0 },
      { quadrant: 'short_measured_test', count: 0 },
      { quadrant: 'no_go_watch', count: 1 },
    ])
    expect(summary.unavailable).toBe(0)
    expect(summary.countedAccounts).toBe(3)
  })

  it('nomme séparément les comptes dont le quadrant est indisponible — jamais fondus dans un quadrant', () => {
    const summary = summarizeAccountInterestPenetrabilityPortfolio(
      portfolio([
        {
          accountId: 'a1',
          companyName: 'Alpha',
          quadrant: null,
          quadrantUnavailableReason: "L'axe intérêt n'a pas assez de facteurs connus",
        },
        { accountId: 'a2', companyName: 'Beta', quadrant: 'priority_now', quadrantUnavailableReason: null },
      ]),
    )
    expect(summary.unavailable).toBe(1)
    expect(summary.byQuadrant.find(q => q.quadrant === 'priority_now')?.count).toBe(1)
    expect(summary.byQuadrant.reduce((sum, q) => sum + q.count, 0)).toBe(1)
  })

  it('un portefeuille vide rend quatre quadrants à zéro, zéro indisponible', () => {
    const summary = summarizeAccountInterestPenetrabilityPortfolio(portfolio([]))
    expect(summary.byQuadrant.every(q => q.count === 0)).toBe(true)
    expect(summary.unavailable).toBe(0)
    expect(summary.countedAccounts).toBe(0)
  })

  // #3277 (recette 02/10) — les noms des consultants placés sont déjà sous « Voie d'accès » dans la
  // carte 5P : « Compatibilité consultant » en donne le NOMBRE, jamais les mêmes noms une troisième fois.
  it('#3277 — le facteur « consultant_fit » compte les consultants placés, il ne les renomme pas', () => {
    const strategy5P = emptyStrategy5P()
    strategy5P.proof.relevant_consultant = knownElement('Awa Diallo, Hakim Barreau, Camille Roussel', 'observed')
    const factor = deriveAccountInterestPenetrability(baseInput({ strategy5P })).interest.factors.find(
      f => f.key === 'consultant_fit',
    )
    expect(factor?.status).toBe('observed')
    expect(factor?.evidence).toBe('3 consultants déjà placés chez ce compte')
    expect(factor?.evidence).not.toMatch(/Awa|Hakim|Camille/)

    const single = emptyStrategy5P()
    single.proof.relevant_consultant = knownElement('Awa Diallo', 'observed')
    expect(
      deriveAccountInterestPenetrability(baseInput({ strategy5P: single })).interest.factors.find(
        f => f.key === 'consultant_fit',
      )?.evidence,
    ).toBe('1 consultant déjà placé chez ce compte')
  })
  // #3277 (X64, recette 02/10) — NOVA LOGISTIQUE : « Léa Fontaine, Camille Roussel » s'affichaient sous
  // « Voie d'accès » ET sous le facteur « Ancien consultant ». Un nom ne s'affiche qu'une fois (GA-26).
  it('#3277 — le facteur « former_consultant » compte les consultants, il ne les renomme pas', () => {
    const former = emptyStrategy5P()
    former.passage.former_consultant = knownElement('Léa Fontaine, Camille Roussel', 'observed')
    const factor = deriveAccountInterestPenetrability(baseInput({ strategy5P: former })).penetrability.factors.find(
      f => f.key === 'former_consultant',
    )
    expect(factor?.status).toBe('observed')
    expect(factor?.evidence).toBe('2 anciens consultants passés chez ce compte')
    expect(factor?.evidence).not.toMatch(/Léa|Camille/)

    const current = emptyStrategy5P()
    current.passage.current_consultant = knownElement('Awa Diallo', 'observed')
    expect(
      deriveAccountInterestPenetrability(baseInput({ strategy5P: current })).penetrability.factors.find(
        f => f.key === 'former_consultant',
      )?.evidence,
    ).toBe('1 consultant en poste chez ce compte')
  })
})
