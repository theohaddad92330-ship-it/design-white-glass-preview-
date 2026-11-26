import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_CONTEXT_SCREEN,
  ACCOUNT_HIRING_INTERVENTION_KEY,
  accountResourceMeasure,
  accountSuggestionSchema,
  offerLensFrom,
  type AccountSuggestionFact,
} from './laura-account-context.js'
import { LAURA_INTERVENTIONS } from './laura-interventions.js'
import { offerPortfolioSchema, resolvedPortfolio } from './offer-portfolio.js'

describe('la ressource disponible — « zéro » et « pas mesuré » ne se confondent jamais', () => {
  it('une lecture impossible se TAIT — elle ne dit pas zéro', () => {
    expect(accountResourceMeasure({ availableNow: null, undeclared: null })).toEqual({
      state: 'unmeasured',
      reason: 'talent_pool_unreadable',
    })
  })

  it('un vivier LISIBLE et vide dit zéro — c’est un fait, pas une absence', () => {
    expect(accountResourceMeasure({ availableNow: 0, undeclared: 0 })).toEqual({
      state: 'measured',
      availableNow: 0,
      undeclared: 0,
    })
  })

  it('le compte des disponibilités NON RENSEIGNÉES voyage à côté du zéro', () => {
    // Sans lui, « 0 disponible » sur un vivier de douze fiches muettes se lit
    // « personne n'est libre », alors que la vérité est « personne ne l'a dit ».
    expect(accountResourceMeasure({ availableNow: 0, undeclared: 12 })).toEqual({
      state: 'measured',
      availableNow: 0,
      undeclared: 12,
    })
  })

  it('une moitié illisible suffit à ne rien affirmer', () => {
    // `undeclared` illisible et `availableNow` lu : le total ne veut plus rien
    // dire, donc l'encadré se tait plutôt que d'afficher un chiffre orphelin.
    expect(accountResourceMeasure({ availableNow: 3, undeclared: null }).state).toBe('unmeasured')
  })

  it('un compte négatif ou non fini n’est pas une mesure', () => {
    expect(accountResourceMeasure({ availableNow: -1, undeclared: 0 }).state).toBe('unmeasured')
    expect(accountResourceMeasure({ availableNow: Number.NaN, undeclared: 0 }).state).toBe('unmeasured')
  })
})

describe('la suggestion se DÉCOMPOSE — jamais une boîte noire', () => {
  const hiring: AccountSuggestionFact = {
    kind: 'hiring_signal',
    statement: 'Deux postes Méthodes ouverts sur le site de Toulouse',
    source: 'Site carrières du groupe',
    observedOn: '2026-07-21',
    count: 2,
  }

  it('accepte une suggestion dont chaque fait porte sa source', () => {
    const parsed = accountSuggestionSchema.parse({
      accountId: '11111111-1111-4111-8111-111111111111',
      facts: [hiring],
      resource: { state: 'measured', availableNow: 1, undeclared: 0 },
    })
    expect(parsed.facts).toHaveLength(1)
    expect(parsed.facts[0]?.source).toBe('Site carrières du groupe')
  })

  it('une source ou une date ABSENTE reste `null` — jamais devinée', () => {
    const parsed = accountSuggestionSchema.parse({
      accountId: '11111111-1111-4111-8111-111111111111',
      facts: [{ ...hiring, source: null, observedOn: null, count: null }],
      resource: { state: 'unmeasured', reason: 'talent_pool_unreadable' },
    })
    expect(parsed.facts[0]?.source).toBeNull()
    expect(parsed.facts[0]?.observedOn).toBeNull()
    expect(parsed.facts[0]?.count).toBeNull()
  })

  it('refuse une suggestion SANS aucun fait — elle serait exactement la boîte noire', () => {
    expect(() =>
      accountSuggestionSchema.parse({
        accountId: '11111111-1111-4111-8111-111111111111',
        facts: [],
        resource: { state: 'unmeasured', reason: 'talent_pool_unreadable' },
      }),
    ).toThrow()
  })
})

describe("le bandeau de personnalisation — il DIT quand le portefeuille n'est pas renseigné", () => {
  it('un portefeuille jamais enregistré est NOMMÉ comme tel', () => {
    const lens = offerLensFrom(resolvedPortfolio({ portfolio: null, offer_domain: null, offer_domains: [] }))
    expect(lens).toEqual({ state: 'not_configured' })
  })

  it('un portefeuille enregistré rend ses domaines ET son territoire', () => {
    const portfolio = offerPortfolioSchema.parse({
      // La correction humaine du type de société — c'est elle qui gagne.
      company_type: 'industrial_engineering',
      target_application_sectors: [],
      target_geographies: ['AURA', 'BFC', 'PACA'],
    })
    const lens = offerLensFrom(resolvedPortfolio({ portfolio, offer_domain: null, offer_domains: [] }))
    expect(lens.state).toBe('configured')
    if (lens.state !== 'configured') throw new Error('unreachable')
    expect(lens.territories).toEqual(['AURA', 'BFC', 'PACA'])
    expect(lens.companyType).toBe('industrial_engineering')
  })

  it('un portefeuille enregistré SANS territoire ne devine pas « France entière »', () => {
    const portfolio = offerPortfolioSchema.parse({ target_geographies: [] })
    const lens = offerLensFrom(resolvedPortfolio({ portfolio, offer_domain: null, offer_domains: [] }))
    expect(lens.state).toBe('configured')
    if (lens.state !== 'configured') throw new Error('unreachable')
    expect(lens.territories).toEqual([])
    // Le type de société peut rester inconnu : rien ne le déduit d'un silence.
    expect(lens.companyType).toBeNull()
  })
})

describe("l'écran du dossier de compte est nommé à UN seul endroit", () => {
  it('la constante est le motif que porte le catalogue', () => {
    const entry = LAURA_INTERVENTIONS.find(intervention => intervention.key === ACCOUNT_HIRING_INTERVENTION_KEY)
    expect(entry).toBeDefined()
    expect(entry?.screen).toBe(ACCOUNT_CONTEXT_SCREEN)
  })

  it("l'intervention de compte ne porte AUCUNE route figée — elle vise LE compte ouvert", () => {
    // Une route de catalogue est statique ; le geste, lui, porte sur le dossier
    // que le commercial a sous les yeux. Le panneau navigue lui-même.
    const entry = LAURA_INTERVENTIONS.find(intervention => intervention.key === ACCOUNT_HIRING_INTERVENTION_KEY)
    expect(entry?.route).toBeNull()
  })
})
