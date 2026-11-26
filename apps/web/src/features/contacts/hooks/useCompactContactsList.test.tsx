import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCompactContactsList } from './useCompactContactsList'

// Théo B c1-repertoire.N1 — « Compacter la liste » : préférence par utilisateur, front seul.
describe('useCompactContactsList — c1-repertoire.N1', () => {
  beforeEach(() => window.localStorage.clear())

  it('par défaut la liste est aérée', () => {
    const { result } = renderHook(() => useCompactContactsList())
    expect(result.current.compact).toBe(false)
  })

  it('basculer la compacte, et le choix survit au rechargement', () => {
    const first = renderHook(() => useCompactContactsList())
    act(() => first.result.current.setCompact(true))
    expect(first.result.current.compact).toBe(true)
    first.unmount()
    const second = renderHook(() => useCompactContactsList())
    expect(second.result.current.compact).toBe(true)
  })

  it('un stockage refusé ne casse pas l’écran : le choix tient pour la session', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    try {
      const { result } = renderHook(() => useCompactContactsList())
      expect(result.current.compact).toBe(false)
      act(() => result.current.setCompact(true))
      expect(result.current.compact).toBe(true)
    } finally {
      Storage.prototype.getItem = original
    }
  })
})
