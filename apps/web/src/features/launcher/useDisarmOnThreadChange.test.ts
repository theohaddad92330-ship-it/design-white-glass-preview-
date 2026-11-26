import { renderHook } from '@testing-library/react'
import { useDisarmOnThreadChange } from './useDisarmOnThreadChange'

describe('useDisarmOnThreadChange — Entrée ne navigue plus vers un run armé dans un autre fil (recette Z3 04/10)', () => {
  it('désarme quand la conversation change', () => {
    const disarm = vi.fn()
    const { rerender } = renderHook(({ id }) => useDisarmOnThreadChange({ disarm }, id), {
      initialProps: { id: 'new' as string | null },
    })
    expect(disarm).not.toHaveBeenCalled()
    rerender({ id: 'conv-1' })
    expect(disarm).toHaveBeenCalledTimes(1)
  })

  it('ne désarme pas tant que le fil est le même (un run armé dans ce fil reste armé)', () => {
    const disarm = vi.fn()
    const { rerender } = renderHook(({ id }) => useDisarmOnThreadChange({ disarm }, id), {
      initialProps: { id: 'conv-1' },
    })
    rerender({ id: 'conv-1' })
    expect(disarm).not.toHaveBeenCalled()
  })

  it('sans lanceur, ne fait rien', () => {
    const { rerender } = renderHook(({ id }) => useDisarmOnThreadChange(null, id), { initialProps: { id: 'a' } })
    expect(() => rerender({ id: 'b' })).not.toThrow()
  })
})
