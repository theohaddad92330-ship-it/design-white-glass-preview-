import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ContactsApiModule from '@/features/contacts/api'

// #AM.39 (#4063) — l'état « enrichissement en cours » vient d'UN index serveur, lu par la liste et par tous les
// chemins d'enrichissement (pas seulement le bouton de la fiche).
const enrichmentInFlight = vi.fn()
vi.mock('@/features/contacts/api', async () => {
  const actual = await vi.importActual<typeof ContactsApiModule>('@/features/contacts/api')
  return {
    ...actual,
    contactsApi: { ...actual.contactsApi, enrichmentInFlight: (...a: unknown[]) => enrichmentInFlight(...a) },
  }
})

import { resetEnrichmentInFlight, useEnrichmentInFlight } from './useEnrichmentInFlight'

beforeEach(() => {
  enrichmentInFlight.mockReset()
  resetEnrichmentInFlight()
})

describe('useEnrichmentInFlight — #AM.39', () => {
  it('dit quels contacts sont en cours d’enrichissement, et lesquels non', async () => {
    enrichmentInFlight.mockResolvedValue({ contacts: [{ contactId: 'c1' }, { contactId: 'c3', only: 'phone' }] })
    const { result, unmount } = renderHook(() => useEnrichmentInFlight())
    await waitFor(() => expect(result.current.count).toBe(2))
    expect(result.current.isInFlight('c1')).toBe(true)
    expect(result.current.isInFlight('c3')).toBe(true)
    expect(result.current.isInFlight('c2')).toBe(false)
    unmount()
  })

  it('NON : aucun job en vol, ou lecture en échec — personne n’est dit « en cours »', async () => {
    enrichmentInFlight.mockRejectedValueOnce(new Error('réseau'))
    const { result, unmount } = renderHook(() => useEnrichmentInFlight())
    await waitFor(() => expect(enrichmentInFlight).toHaveBeenCalled())
    expect(result.current.isInFlight('c1')).toBe(false)
    expect(result.current.count).toBe(0)
    unmount()
  })
})
