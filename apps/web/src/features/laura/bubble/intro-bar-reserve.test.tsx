import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { INTRO_BAR_RESERVE_PROPERTY, INTRO_BAR_RESERVE_REM, useIntroBarReserve } from './intro-bar-reserve'

/**
 * E25 (recette démo 04/10 soir) — la ligne d'amorce de Laura (fixe, bas droite) recouvrait la dernière
 * ligne du tableau /missions : la page doit RÉSERVER la place tant que la ligne est montrée.
 */
function reserve(): string {
  return document.documentElement.style.getPropertyValue(INTRO_BAR_RESERVE_PROPERTY)
}

describe('useIntroBarReserve', () => {
  it('pose la réserve tant que la ligne est montrée, et la retire quand elle disparaît', () => {
    const { rerender, unmount } = renderHook(({ shown }) => useIntroBarReserve(shown), {
      initialProps: { shown: true },
    })
    expect(reserve()).toBe(`${INTRO_BAR_RESERVE_REM}rem`)
    rerender({ shown: false })
    expect(reserve()).toBe('')
    rerender({ shown: true })
    expect(reserve()).toBe(`${INTRO_BAR_RESERVE_REM}rem`)
    unmount()
    expect(reserve()).toBe('')
  })

  it('ne réserve rien quand la ligne n’est pas montrée (cas par défaut)', () => {
    renderHook(() => useIntroBarReserve(false))
    expect(reserve()).toBe('')
  })
})
