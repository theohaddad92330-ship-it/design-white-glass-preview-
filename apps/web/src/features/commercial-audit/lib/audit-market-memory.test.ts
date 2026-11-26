import { describe, expect, it } from 'vitest'
import type { MarketContextMatch } from '@bellum/contracts'
import { AUDIT_MARKET_MEMORY_MAX_ACCOUNTS, buildAuditMarketMemoryAccounts } from './audit-market-memory'

function match(companyName: string, observedStack: readonly string[] = []): MarketContextMatch {
  return {
    companyName,
    coverage: {
      covered: true,
      marketPaths: 12,
      esnObserved: [],
      observedStack: observedStack.map(techno => ({ techno, persons: 4 })),
      roleFamilies: [],
      exEsnPresent: null,
      observedZone: null,
    },
  } satisfies MarketContextMatch
}

/**
 * #2090.38 — LA RAISON DE COMPATIBILITÉ, JAMAIS UNE GRADATION.
 *
 * ⚠️ Le contrat `MarketContextMatch` ne porte NI logo NI ville NI secteur
 * (`packages/contracts/src/schemas/companies.ts`) : cette dérivation ne les
 * invente pas, elle rend ce que le corpus porte réellement (nom + recoupement
 * d'expertise, `marketFitFor`, le MÊME que Découvrir et `MarketAwarenessCard`).
 */
describe('buildAuditMarketMemoryAccounts', () => {
  it('marque « compatible » un compte dont la pile observée recoupe une expertise déclarée', () => {
    const accounts = buildAuditMarketMemoryAccounts([match('Orange', ['Java', 'AWS'])], ['Java'])
    expect(accounts).toEqual([{ companyName: 'Orange', compatible: true, matchedExpertises: ['Java'] }])
  })

  it('marque « à qualifier » un compte sans recoupement — jamais un score, jamais « incompatible »', () => {
    const accounts = buildAuditMarketMemoryAccounts([match('SNCF', ['Mainframe'])], ['Java'])
    expect(accounts).toEqual([{ companyName: 'SNCF', compatible: false, matchedExpertises: [] }])
  })

  it(`borne l'aperçu à ${AUDIT_MARKET_MEMORY_MAX_ACCOUNTS} comptes — un aperçu, jamais une liste exhaustive`, () => {
    const matches = Array.from({ length: 20 }, (_, i) => match(`Compte ${i}`))
    expect(buildAuditMarketMemoryAccounts(matches, [])).toHaveLength(AUDIT_MARKET_MEMORY_MAX_ACCOUNTS)
  })
})
