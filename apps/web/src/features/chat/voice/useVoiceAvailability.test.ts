import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const statusMock = vi.hoisted(() => vi.fn())
vi.mock('./voice-api', () => ({ fetchVoiceStatus: (...args: unknown[]) => statusMock(...args) }))
const capableMock = vi.hoisted(() => ({ current: true }))
vi.mock('./voice-recorder', () => ({ voiceCaptureSupported: () => capableMock.current }))

const { useVoiceAvailability } = await import('./useVoiceAvailability')

// #2434.55 — extrait de `VoiceInput.tsx` pour être réutilisé par la dictée
// d'une liste (`ImportTargetListDialog.tsx`) : le navigateur, PUIS le serveur,
// et jamais en démonstration — la MÊME règle, un seul endroit (GA-26).

beforeEach(() => {
  statusMock.mockReset().mockResolvedValue(true)
  capableMock.current = true
})

describe('useVoiceAvailability', () => {
  it('navigateur capable, serveur disponible, pas en démo → true', async () => {
    const { result } = renderHook(() => useVoiceAvailability(false))
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('en démonstration : jamais interrogé, jamais disponible — le test qui dit NON', async () => {
    const { result } = renderHook(() => useVoiceAvailability(true))
    expect(result.current).toBe(false)
    expect(statusMock).not.toHaveBeenCalled()
  })

  it('navigateur incapable : le serveur n’est même pas interrogé', async () => {
    capableMock.current = false
    const { result } = renderHook(() => useVoiceAvailability(false))
    expect(result.current).toBe(false)
    expect(statusMock).not.toHaveBeenCalled()
  })

  it('serveur indisponible : false même si le navigateur sait enregistrer', async () => {
    statusMock.mockResolvedValue(false)
    const { result } = renderHook(() => useVoiceAvailability(false))
    await waitFor(() => expect(statusMock).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })
})
