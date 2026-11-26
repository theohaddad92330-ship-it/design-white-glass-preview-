import { describe, expect, it } from 'vitest'
import { evaluateSignalActionGate, type SignalActionGateInput } from './signalActionGate'

// #2952 (#2305.43/.44/.45/.47/.48) — un signal ne devient action que si les
// cinq conditions de LAU-FINAL-046 tiennent ; sinon le fallback explicite.
const ALLOWED: SignalActionGateInput = {
  type: 'appel_offres',
  signal: 'Publie un appel d’offres pour sa refonte SI',
  perimeterIsSpecific: true,
  freshness: 'current',
  hasRealSource: true,
}

describe('evaluateSignalActionGate', () => {
  it('autorise quand les cinq conditions tiennent', () => {
    expect(evaluateSignalActionGate(ALLOWED)).toEqual({ allowed: true })
  })

  it("refuse avec le fallback explicite quand l'offre n'est pas pertinente (#2305.43)", () => {
    const result = evaluateSignalActionGate({ ...ALLOWED, type: 'recrutement', signal: 'Recrute en CDI' })
    expect(result).toEqual({ allowed: false, fallback: 'context_only' })
  })

  it('refuse quand le périmètre n’est pas clair (#2305.44)', () => {
    const result = evaluateSignalActionGate({ ...ALLOWED, perimeterIsSpecific: false })
    expect(result).toEqual({ allowed: false, fallback: 'context_only' })
  })

  it('refuse quand aucun interlocuteur ni recherche n’est possible (#2305.45)', () => {
    // Aujourd'hui dérivé du même périmètre spécifique : pas de périmètre
    // nommé ⇒ pas de recherche possible non plus.
    const result = evaluateSignalActionGate({ ...ALLOWED, perimeterIsSpecific: false })
    expect(result.allowed).toBe(false)
  })

  it('refuse quand le timing n’est pas actuel (#2305.46, déjà là)', () => {
    const result = evaluateSignalActionGate({ ...ALLOWED, freshness: 'archive' })
    expect(result).toEqual({ allowed: false, fallback: 'context_only' })
  })

  it('refuse quand l’action ne serait pas responsable — aucune source réelle (#2305.47)', () => {
    const result = evaluateSignalActionGate({ ...ALLOWED, hasRealSource: false })
    expect(result).toEqual({ allowed: false, fallback: 'context_only' })
  })

  it('le fallback est toujours le même littéral, quelle que soit la condition en cause (#2305.48)', () => {
    const failures = [
      { ...ALLOWED, type: 'nomination', signal: 'Nomme un nouveau DAF' },
      { ...ALLOWED, perimeterIsSpecific: false },
      { ...ALLOWED, freshness: 'archive' as const },
      { ...ALLOWED, hasRealSource: false },
    ]
    for (const failure of failures) {
      expect(evaluateSignalActionGate(failure)).toEqual({ allowed: false, fallback: 'context_only' })
    }
  })
})
