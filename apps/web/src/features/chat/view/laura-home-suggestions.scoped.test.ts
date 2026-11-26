import { describe, expect, it } from 'vitest'
import { resolveLauraHomeSuggestions, type LauraHomeContext } from './laura-home-suggestions'

// #5042 — revient sur #3654 (arbitrage Louis 31/10) : plus de six amorces propres au compte ciblé.
type T = Parameters<typeof resolveLauraHomeSuggestions>[0]
const t = ((key: string) => key) as unknown as T

const NOTHING: LauraHomeContext = { hasPortfolio: false, hasVivier: false, hasPartners: false }

describe('resolveLauraHomeSuggestions — un compte ciblé ne change plus l’accueil (#5042)', () => {
  it('aucune amorce propre au compte : le contexte ne porte plus de nom de compte', () => {
    const suggestions = resolveLauraHomeSuggestions(t, { ...NOTHING, hasPortfolio: true })
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.some(s => s.id.startsWith('account.'))).toBe(false)
    expect(suggestions.some(s => s.label.includes('scoped'))).toBe(false)
  })

  it('sait dire NON : un nom de compte glissé dans le contexte ne ramène pas les six amorces', () => {
    const withName = { ...NOTHING, hasPortfolio: true, accountName: 'Société Générale' } as LauraHomeContext
    const ids = resolveLauraHomeSuggestions(t, withName).map(s => s.id)
    expect(ids).toEqual(resolveLauraHomeSuggestions(t, { ...NOTHING, hasPortfolio: true }).map(s => s.id))
  })
})
