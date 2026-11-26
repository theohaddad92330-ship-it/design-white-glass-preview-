import { describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { followCoordinateConclusion } from './followCoordinateConclusion'

/**
 * #4063 (recette R15, 15/10) — « Recherche en cours » puis plus rien : un timeout n'est pas un échec
 * (`unknown`), le toast intermédiaire est juste, MAIS la conclusion doit arriver ensuite SANS geste.
 */
const contact = (patch: Partial<Contact>): Contact => ({ id: 'c1', ...patch }) as Contact
const coordinate = (state: 'found' | 'not_found' | 'pending' | 'unknown') => ({
  state,
  sources_queried: 2,
  at: '2026-10-15T10:00:00Z',
})

describe('followCoordinateConclusion (#4063)', () => {
  it('conclut « found » dès que le téléphone arrive sur la fiche', async () => {
    const fetchContact = vi
      .fn()
      .mockResolvedValueOnce(contact({ enrichment_coordinates: { phone: coordinate('pending') } }))
      .mockResolvedValueOnce(
        contact({ phone: '+33 6 00 00 00 00', enrichment_coordinates: { phone: coordinate('found') } }),
      )
    const result = await followCoordinateConclusion({ fetchContact, channel: 'phone', wait: async () => {} })
    expect(result).toBe('found')
    expect(fetchContact).toHaveBeenCalledTimes(2)
  })

  it('conclut « not_found » quand la source a répondu rien', async () => {
    const fetchContact = vi
      .fn()
      .mockResolvedValue(contact({ enrichment_coordinates: { phone: coordinate('not_found') } }))
    expect(await followCoordinateConclusion({ fetchContact, channel: 'phone', wait: async () => {} })).toBe('not_found')
  })

  it('ne conclut JAMAIS « introuvable » sur un état qui reste pending/unknown : « open » à l’échéance', async () => {
    const fetchContact = vi
      .fn()
      .mockResolvedValue(contact({ enrichment_coordinates: { phone: coordinate('unknown') } }))
    const result = await followCoordinateConclusion({
      fetchContact,
      channel: 'phone',
      wait: async () => {},
      maxAttempts: 3,
    })
    expect(result).toBe('open')
    expect(fetchContact).toHaveBeenCalledTimes(3)
  })

  it('une panne de lecture ne conclut rien (open), elle ne lève pas', async () => {
    const fetchContact = vi.fn().mockRejectedValue(new Error('réseau'))
    expect(
      await followCoordinateConclusion({ fetchContact, channel: 'phone', wait: async () => {}, maxAttempts: 2 }),
    ).toBe('open')
  })

  it('un signal d’annulation arrête le suivi', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchContact = vi.fn()
    expect(
      await followCoordinateConclusion({
        fetchContact,
        channel: 'phone',
        wait: async () => {},
        signal: controller.signal,
      }),
    ).toBe('open')
    expect(fetchContact).not.toHaveBeenCalled()
  })
})
