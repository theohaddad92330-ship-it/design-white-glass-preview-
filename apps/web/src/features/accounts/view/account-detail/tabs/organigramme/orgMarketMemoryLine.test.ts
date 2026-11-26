import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { orgMarketMemoryLine } from './orgMarketMemoryLine'

const tAccounts = ((key: string, options?: { count?: number }) => {
  const dict: Record<string, string> = {
    'marketContext.title': 'Contexte marché',
    'marketContext.loading': 'Lecture…',
    'marketContext.unavailable': 'Indisponible',
    'marketContext.notMeasured': 'Non mesuré',
    'marketContext.paths': `${options?.count} chemins observés`,
  }
  return dict[key] ?? key
}) as unknown as Parameters<typeof orgMarketMemoryLine>[0]

describe('orgMarketMemoryLine — la même dérivation pour les 4 vues (#2837)', () => {
  it('sans accountId, ne rend rien — pas d’entité à interroger', () => {
    expect(
      orgMarketMemoryLine(tAccounts, { accountId: undefined, isPending: false, isError: false, data: null }),
    ).toBeNull()
  })

  it('en cours de lecture, le dit — jamais un chiffre deviné', () => {
    expect(orgMarketMemoryLine(tAccounts, { accountId: 'acc-1', isPending: true, isError: false, data: null })).toBe(
      'Contexte marché · Lecture…',
    )
  })

  it('en panne, le dit — jamais un silence indiscernable d’un chargement', () => {
    expect(orgMarketMemoryLine(tAccounts, { accountId: 'acc-1', isPending: false, isError: true, data: null })).toBe(
      'Contexte marché · Indisponible',
    )
  })

  it('couvert, porte le compte de chemins observés — jamais un 0 sur une absence', () => {
    expect(
      orgMarketMemoryLine(tAccounts, {
        accountId: 'acc-1',
        isPending: false,
        isError: false,
        data: { paths_observed: 3 } as never,
      }),
    ).toBe('Contexte marché · 3 chemins observés')
  })

  it('non couvert, dit « non mesuré » — jamais « 0 »', () => {
    expect(orgMarketMemoryLine(tAccounts, { accountId: 'acc-1', isPending: false, isError: false, data: null })).toBe(
      'Contexte marché · Non mesuré',
    )
  })
})

// #4322 — « 65 parcours observés » ne disait ni quoi ni d'où : la phrase nomme l'unité et la source (sans fournisseur).
describe('marketContext.paths — la phrase dit ce qui est compté et d’où (#4322)', () => {
  const load = (lang: 'fr' | 'en') =>
    (
      JSON.parse(readFileSync(resolve(__dirname, `../../../../../../i18n/locales/${lang}/accounts.json`), 'utf8')) as {
        marketContext: Record<string, string>
      }
    ).marketContext
  it.each([
    ['fr', /carrière.*données de marché.*passées par ce compte/],
    ['en', /career path.*market data.*went through this account/],
  ] as const)('%s : unité + source + personnes concernées', (lang, pattern) => {
    const ctx = load(lang)
    expect(ctx.paths_one).toMatch(pattern)
    expect(ctx.paths_other).toMatch(pattern)
    expect(ctx.paths_other).toContain('{{count}}')
  })
})
