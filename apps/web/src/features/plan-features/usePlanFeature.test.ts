import { describe, expect, it, vi } from 'vitest'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))

function mockCredits(data: Record<string, unknown> | undefined) {
  vi.mocked(useCredits).mockReturnValue({ data } as unknown as ReturnType<typeof useCredits>)
}

describe('usePlanFeature', () => {
  it('ouvre ce que le palier porte', () => {
    mockCredits({ features: ['chat_ai', 'exports'] })
    expect(usePlanFeature('chat_ai')).toEqual({ known: true, allowed: true })
  })

  it('ferme ce que le palier ne porte pas', () => {
    mockCredits({ features: ['chat_ai'] })
    expect(usePlanFeature('crm_sync')).toEqual({ known: true, allowed: false })
  })

  it('une grille vide ferme tout (c’est une décision d’opérateur, pas un vide)', () => {
    mockCredits({ features: [] })
    expect(usePlanFeature('chat_ai').allowed).toBe(false)
  })

  it('le doute n’interdit pas : charge en vol ⇒ rien n’est verrouillé', () => {
    mockCredits(undefined)
    expect(usePlanFeature('chat_ai')).toEqual({ known: false, allowed: true })
  })

  it('une réponse antérieure au champ laisse tout ouvert (le serveur tranche)', () => {
    // Verrouiller sur l'absence du champ afficherait un cadenas à des clients
    // qui ont la fonction, juste parce que l'API n'est pas encore déployée.
    mockCredits({ plan: 'growth' })
    expect(usePlanFeature('mcp_assistant')).toEqual({ known: false, allowed: true })
  })
})
