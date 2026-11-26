import { describe, expect, it, vi } from 'vitest'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { usePlans } from '@/features/credits/hooks/usePlans'
import { useLockedNavFeatures } from '@/features/plan-features/useLockedNavFeatures'
import { useUpgradeTarget } from '@/features/plan-features/useUpgradeTarget'

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))
vi.mock('@/features/credits/hooks/usePlans', () => ({ usePlans: vi.fn() }))

const CATALOG = {
  starter: { label: 'Starter-Solo', price: 11900, features: ['exports'] },
  team: { label: 'Team', price: 25900, features: ['exports', 'chat_ai', 'discover'] },
  growth: { label: 'Growth', price: 59900, features: ['exports', 'chat_ai', 'discover', 'crm_sync'] },
}

function mock(catalog: unknown, credits: unknown) {
  vi.mocked(usePlans).mockReturnValue({ data: catalog } as unknown as ReturnType<typeof usePlans>)
  vi.mocked(useCredits).mockReturnValue({ data: credits } as unknown as ReturnType<typeof useCredits>)
}

describe('useUpgradeTarget', () => {
  it('propose le palier le MOINS CHER qui porte la fonction', () => {
    mock(CATALOG, { features: ['exports'] })
    const target = useUpgradeTarget('chat_ai')
    expect(target.planId).toBe('team')
    expect(target.planName).toBe('Team')
    expect(target.priceEuros).toBe(259)
  })

  it('liste tout ce que le passage débloque, la fonction demandée en tête', () => {
    mock(CATALOG, { features: ['exports'] })
    // C'est l'argument du passage : le commercial a buté sur le copilote, mais
    // il gagne aussi Découvrir — sans ça, il ne voit qu'une porte fermée.
    expect(useUpgradeTarget('chat_ai').alsoUnlocks).toEqual(['chat_ai', 'discover'])
  })

  it("ne recompte pas ce que l'offre actuelle ouvre déjà", () => {
    mock(CATALOG, { features: ['exports', 'chat_ai', 'discover'] })
    expect(useUpgradeTarget('crm_sync').alsoUnlocks).toEqual(['crm_sync'])
  })

  it("ne cite aucune offre quand le catalogue n'a pas répondu", () => {
    mock(undefined, { features: [] })
    // Mieux vaut un verrou muet qu'un palier inventé : le prix affiché doit
    // toujours venir du catalogue.
    expect(useUpgradeTarget('chat_ai')).toEqual({
      planId: null,
      planName: null,
      priceEuros: null,
      alsoUnlocks: [],
    })
  })

  it('ne promet rien quand aucun palier vendable ne porte la fonction', () => {
    mock({ starter: { label: 'Starter-Solo', price: 11900, features: [] } }, { features: [] })
    expect(useUpgradeTarget('public_api').planId).toBeNull()
  })
})

describe('useLockedNavFeatures', () => {
  it('rend les features absentes de l’offre', () => {
    vi.mocked(useCredits).mockReturnValue({
      data: { features: ['exports', 'chat_ai'] },
    } as unknown as ReturnType<typeof useCredits>)
    const locked = useLockedNavFeatures()
    expect(locked.has('discover')).toBe(true)
    expect(locked.has('chat_ai')).toBe(false)
  })

  it('le doute ne verrouille rien : aucune donnée ⇒ ensemble vide', () => {
    vi.mocked(useCredits).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useCredits>)
    expect(useLockedNavFeatures().size).toBe(0)
  })
})
