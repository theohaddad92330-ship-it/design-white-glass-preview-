import { describe, expect, it, vi } from 'vitest'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))

function mockCredits(data: Record<string, unknown> | undefined) {
  vi.mocked(useCredits).mockReturnValue({ data } as unknown as ReturnType<typeof useCredits>)
}

describe('useCreditGate', () => {
  // #4463 — le gate ne porte plus aucun nombre : l'écran n'a pas le droit de l'afficher.
  it('ne porte aucun solde chiffré', () => {
    mockCredits({ credits_remaining: 5 })
    const gate = useCreditGate()
    expect(Object.keys(gate).sort()).toEqual(['canAnalyze', 'canEnrich', 'known', 'locked'])
  })

  it('interdit ce que le solde ne permet pas (fallback sans credits_remaining)', () => {
    mockCredits({ accounts_limit: 10, accounts_used: 10 })
    const gate = useCreditGate()
    expect(gate.canAnalyze).toBe(false)
    expect(gate.canEnrich).toBe(false)
    expect(gate).not.toHaveProperty('creditsLeft')
  })

  it('monnaie unique : le même solde autorise analyse ET enrichissement', () => {
    mockCredits({ credits_remaining: 5 })
    const gate = useCreditGate()
    expect(gate.canAnalyze).toBe(true)
    expect(gate.canEnrich).toBe(true)
  })

  it('à zéro, plus aucune action n’est possible', () => {
    mockCredits({ credits_remaining: 0 })
    const gate = useCreditGate()
    expect(gate.canAnalyze).toBe(false)
    expect(gate.canEnrich).toBe(false)
  })

  it('le doute n’interdit pas : solde inconnu ⇒ rien n’est grisé', () => {
    mockCredits(undefined)
    const gate = useCreditGate()
    expect(gate.known).toBe(false)
    expect(gate.canAnalyze).toBe(true)
    expect(gate.canEnrich).toBe(true)
  })

  it('une fenêtre expirée ferme tout, même avec des crédits au compteur', () => {
    mockCredits({ credits_remaining: 40, trial_expired: true })
    const gate = useCreditGate()
    expect(gate.locked).toBe(true)
    expect(gate.canAnalyze).toBe(false)
    expect(gate.canEnrich).toBe(false)
  })

  it('ne descend jamais sous zéro (dépassement serveur)', () => {
    mockCredits({ credits_remaining: -3 })
    const gate = useCreditGate()
    expect(gate.canAnalyze).toBe(false)
    expect(gate.canEnrich).toBe(false)
  })
})
