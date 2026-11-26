import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema } from './discover.js'

/**
 * #2166.1 — Résultat compte : logo.
 *
 * Le logo n'est JAMAIS deviné : il ne voyage que quand `DiscoverPortfolioService`
 * a trouvé, sans ambiguïté, un compte déjà possédé du même espace portant ce
 * SIREN (même règle que `AccountPartner.logo_url`, #1818.2). Le champ est donc
 * optionnel et nullable — une candidature neuve, jamais possédée, ne le porte
 * pas du tout, et `CompanyAvatar` retombe sur l'initiale.
 */
describe('discoverCandidateSchema — logo (#2166.1)', () => {
  const base = {
    name: 'Capgemini',
    siren: '552081317',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreFactors: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'analyzed' as const,
    accountId: 'acc-1',
    sources: [],
    signals: [],
  }

  it('porte logoUrl et website quand le compte est possédé', () => {
    const parsed = discoverCandidateSchema.parse({
      ...base,
      logoUrl: 'https://logo.example/capgemini.png',
      website: 'capgemini.com',
    })
    expect(parsed.logoUrl).toBe('https://logo.example/capgemini.png')
    expect(parsed.website).toBe('capgemini.com')
  })

  it('accepte un candidat SANS logo ni site — jamais un logo inventé', () => {
    const parsed = discoverCandidateSchema.parse(base)
    expect(parsed.logoUrl).toBeUndefined()
    expect(parsed.website).toBeUndefined()
  })

  it('accepte logoUrl null — un compte possédé sans logo réel', () => {
    const parsed = discoverCandidateSchema.parse({ ...base, logoUrl: null, website: null })
    expect(parsed.logoUrl).toBeNull()
    expect(parsed.website).toBeNull()
  })
})
