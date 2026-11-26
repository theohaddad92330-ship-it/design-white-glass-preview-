import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_DATED_FACTS_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4068.8 — « et en démonstration, les faits datés et typés de Découvrir
 * montrent quoi ? » (craft rule n°9). L'écran n'a ni table ni clé
 * `raw_analysis` à lui : ce fichier lit la VRAIE réponse scriptée.
 *
 * Doit montrer : les trois types (Recrutement = hiring, Besoin = tender,
 * Signal = le reste), au moins un fait ANCIEN (> 90 j avant le 12/10/2026),
 * avec ET sans lien. La démo ne casse jamais : la réponse reste valide au
 * contrat (`url` y est une URL).
 */
// #4068 — les dates scriptées sont re-datées à aujourd'hui (`demoRebasedDay`) : l'âge se lit contre maintenant.
const REFERENCE_DAY = Date.now()
const NINETY_DAYS = 90 * 24 * 3600 * 1000

type RawSignal = { type: string; date: string; url?: string }

function allSignals(): RawSignal[] {
  const response = demoDiscoverResponse({ includeOutOfTarget: true }) as { candidates: { signals: RawSignal[] }[] }
  return response.candidates.flatMap(c => c.signals)
}

describe('#4068.8 — Découvrir en démonstration montre des faits datés et typés', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_DATED_FACTS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_DATED_FACTS_COVERAGE.reason).toContain('#4068.8')
  })

  it('porte les trois types : recrutement, besoin, signal', () => {
    const types = new Set(allSignals().map(s => s.type))
    expect(types.has('hiring')).toBe(true)
    expect(types.has('tender')).toBe(true)
    expect([...types].some(t => t === 'legal' || t === 'award' || t === 'tech')).toBe(true)
  })

  it('porte au moins un fait ANCIEN (> 90 j) et un fait récent', () => {
    const ages = allSignals().map(s => REFERENCE_DAY - Date.parse(s.date))
    expect(ages.some(age => age > NINETY_DAYS)).toBe(true)
    expect(ages.some(age => age <= NINETY_DAYS)).toBe(true)
  })

  it('porte des faits AVEC lien et des faits SANS lien', () => {
    const signals = allSignals()
    expect(signals.some(s => typeof s.url === 'string' && s.url.length > 0)).toBe(true)
    expect(signals.some(s => !s.url)).toBe(true)
  })

  it('un fait ancien porte un lien (le cas « Voir la source » sur un fait vieux)', () => {
    expect(allSignals().some(s => s.url && REFERENCE_DAY - Date.parse(s.date) > NINETY_DAYS)).toBe(true)
  })

  it('la réponse reste valide au contrat (la démo ne casse jamais)', () => {
    const parsed = discoverResponseSchema.safeParse(demoDiscoverResponse({ includeOutOfTarget: true }))
    expect(parsed.success).toBe(true)
  })
})
