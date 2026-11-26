import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useIndexedCallback } from './use-indexed-callback'

// #2441.11 — sans callbacks STABLES par index, un `React.memo` posé sur
// `MessageBubble` n'aurait aucun effet : `onRetry={() => onRetryReply(index)}`
// recrée une closure à CHAQUE render de `Chat.tsx`, donc à chaque token
// streamé, pour les 1000 bulles — pas seulement la dernière.
describe('useIndexedCallback', () => {
  it('rend la MÊME référence de fonction pour un index donné, à travers plusieurs renders', () => {
    const handler = vi.fn()
    const { result, rerender } = renderHook(({ h }) => useIndexedCallback(h), {
      initialProps: { h: handler },
    })
    const fnA = result.current(3)
    rerender({ h: handler })
    const fnB = result.current(3)
    expect(fnA).toBe(fnB)
  })

  it('rend des références différentes pour des index différents', () => {
    const handler = vi.fn()
    const { result } = renderHook(() => useIndexedCallback(handler))
    expect(result.current(0)).not.toBe(result.current(1))
  })

  it('appelle le handler le plus RÉCENT, jamais une closure figée (pas de bug de closure périmée)', () => {
    let calls: number[] = []
    const first = (i: number) => calls.push(i)
    const { result, rerender } = renderHook(({ h }) => useIndexedCallback(h), {
      initialProps: { h: first as (i: number) => void },
    })
    const fn = result.current(5)
    fn()
    expect(calls).toEqual([5])

    calls = []
    const second = vi.fn()
    rerender({ h: second })
    // même référence de fonction qu'avant…
    const fnAgain = result.current(5)
    expect(fnAgain).toBe(fn)
    // …mais c'est bien le handler du DERNIER render qui répond.
    fnAgain()
    expect(second).toHaveBeenCalledWith(5)
  })

  it('transmet les arguments supplémentaires au handler', () => {
    const handler = vi.fn()
    const { result } = renderHook(() => useIndexedCallback(handler))
    result.current(2)('un-argument')
    expect(handler).toHaveBeenCalledWith(2, 'un-argument')
  })

  it('vide son cache quand `resetKey` change (ex. changement de conversation)', () => {
    const handler = vi.fn()
    const { result, rerender } = renderHook(({ key }) => useIndexedCallback(handler, key), {
      initialProps: { key: 'conv-1' },
    })
    const fnBefore = result.current(0)
    rerender({ key: 'conv-2' })
    const fnAfter = result.current(0)
    expect(fnAfter).not.toBe(fnBefore)
  })
})
