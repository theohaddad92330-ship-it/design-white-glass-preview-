import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { userMock } = vi.hoisted(() => ({ userMock: vi.fn() }))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: userMock(), loading: false }),
}))

import { useDefaultScopeMode } from './useDefaultScopeMode'

/**
 * #4161 — retour bêta 14/10 : « mon périmètre doit être appliqué par défaut
 * sur les analyses ». Ce hook est le repli (pas le conseil #1592.2, inchangé) :
 * ce qu'un utilisateur a fini par choisir sert de point de départ à la
 * PROCHAINE analyse fraîche, même pattern que `useSearchCountry` (#494).
 */
describe('useDefaultScopeMode', () => {
  beforeEach(() => {
    window.localStorage.clear()
    userMock.mockReturnValue({ id: 'u-1' })
  })

  it("rend `defaultScope: null` tant que rien n'a jamais été mémorisé pour cet utilisateur", () => {
    const { result } = renderHook(() => useDefaultScopeMode())
    expect(result.current.defaultScope).toBeNull()
  })

  it('mémorise le périmètre choisi, et le rend comme défaut au rendu suivant (même utilisateur)', () => {
    const { result, rerender } = renderHook(() => useDefaultScopeMode())
    act(() => result.current.rememberScope('it_digital'))
    rerender()
    expect(result.current.defaultScope).toBe('it_digital')
  })

  it('ne mélange pas les périmètres mémorisés de deux utilisateurs différents (même machine)', () => {
    userMock.mockReturnValue({ id: 'u-1' })
    const first = renderHook(() => useDefaultScopeMode())
    act(() => first.result.current.rememberScope('it_digital'))

    userMock.mockReturnValue({ id: 'u-2' })
    const second = renderHook(() => useDefaultScopeMode())
    expect(second.result.current.defaultScope).toBeNull()
  })

  it('sans session (utilisateur non résolu), ne mémorise rien et ne casse pas — `defaultScope` reste `null`', () => {
    userMock.mockReturnValue(null)
    const { result } = renderHook(() => useDefaultScopeMode())
    expect(() => act(() => result.current.rememberScope('it_digital'))).not.toThrow()
    expect(result.current.defaultScope).toBeNull()
  })

  it('ignore une valeur stockée corrompue (hors énum `AnalysisScopeMode`) plutôt que de la rendre telle quelle', () => {
    window.localStorage.setItem('bellum:search-scope:u-1', 'pas-un-perimetre-connu')
    const { result } = renderHook(() => useDefaultScopeMode())
    expect(result.current.defaultScope).toBeNull()
  })
})
