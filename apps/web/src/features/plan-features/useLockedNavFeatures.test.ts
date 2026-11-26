import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useHideLockedNav } from './useLockedNavFeatures'

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))

function mock(credits: Record<string, unknown> | undefined) {
  vi.mocked(useCredits).mockReturnValue({ data: credits } as ReturnType<typeof useCredits>)
}

describe('masquer les modules verrouillés avant la première analyse (§12)', () => {
  it('un compte neuf ne voit aucun cadenas', () => {
    // Trois cadenas dans la barre latérale de quelqu'un qui n'a pas encore vu
    // un dossier, ce n'est pas une incitation : c'est du bruit, et ça donne
    // l'impression d'un produit dont on n'a acheté qu'un morceau avant même de
    // l'avoir essayé.
    mock({ accounts_used: 0 })
    expect(renderHook(() => useHideLockedNav()).result.current).toBe(true)
  })

  it('après la première analyse, ils réapparaissent avec leur argument', () => {
    // La bascule est la première ANALYSE, pas une date ni un nombre de
    // connexions : c'est le moment où l'utilisateur a vu ce que le produit sait
    // faire, donc le premier où « voici ce que l'offre supérieure ajoute » veut
    // dire quelque chose.
    mock({ accounts_used: 1 })
    expect(renderHook(() => useHideLockedNav()).result.current).toBe(false)
  })

  it('lecture indisponible : on masque — le pire cas honnête', () => {
    // Afficher trois cadenas à quelqu'un dont on ne sait rien est précisément
    // ce qu'on corrige.
    mock(undefined)
    expect(renderHook(() => useHideLockedNav()).result.current).toBe(true)
    mock({})
    expect(renderHook(() => useHideLockedNav()).result.current).toBe(true)
  })
})
