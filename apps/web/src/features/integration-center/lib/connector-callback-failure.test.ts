import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearConnectorFailure, rememberConnectorFailure, useConnectorFailure } from './connector-callback-failure'

// #4431.4 — la raison rendue par le fournisseur au retour OAuth survit au nettoyage de l'URL, pour la carte.
describe('connector-callback-failure', () => {
  beforeEach(() => {
    clearConnectorFailure('salesforce')
    clearConnectorFailure('hubspot')
  })

  it('rien de retenu : aucune raison inventée', () => {
    const { result } = renderHook(() => useConnectorFailure('salesforce'))
    expect(result.current).toBeNull()
  })

  it('retient la raison d’UN fournisseur, sans la prêter à un autre', () => {
    const { result } = renderHook(() => useConnectorFailure('salesforce'))
    const other = renderHook(() => useConnectorFailure('hubspot'))
    act(() => rememberConnectorFailure('salesforce', 'domaine exigé'))
    expect(result.current).toBe('domaine exigé')
    expect(other.result.current).toBeNull()
  })

  it('se vide au prochain essai', () => {
    const { result } = renderHook(() => useConnectorFailure('salesforce'))
    act(() => rememberConnectorFailure('salesforce', 'x'))
    act(() => clearConnectorFailure('salesforce'))
    expect(result.current).toBeNull()
  })
})
