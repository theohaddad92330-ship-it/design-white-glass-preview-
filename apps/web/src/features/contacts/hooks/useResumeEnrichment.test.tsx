import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import type * as ContactsApiModule from '@/features/contacts/api'

/**
 * #4063.1 — quitter la fiche puis revenir : un enrichissement encore en vol côté serveur
 * se RETROUVE (suivi repris, sans second POST donc sans second débit).
 */
const enrichmentStatus = vi.fn()
vi.mock('@/features/contacts/api', async () => {
  const actual = await vi.importActual<typeof ContactsApiModule>('@/features/contacts/api')
  return {
    ...actual,
    contactsApi: { ...actual.contactsApi, enrichmentStatus: (...a: unknown[]) => enrichmentStatus(...a) },
  }
})

import { useResumeEnrichment } from './useResumeEnrichment'

const CONTACT = { id: 'c1', account_id: 'a1', full_name: 'Alice Martin' } as unknown as Contact
const mutate = vi.fn()
const run = (over: { isPending?: boolean; orgName?: string } = {}) =>
  renderHook(() =>
    useResumeEnrichment({
      contact: CONTACT,
      orgName: over.orgName ?? 'ACME',
      mutation: { mutate, isPending: over.isPending ?? false },
    }),
  )

beforeEach(() => {
  enrichmentStatus.mockReset()
  mutate.mockReset()
})

describe('useResumeEnrichment', () => {
  it.each(['queued', 'running'])('reprend le suivi quand le job est %s', async state => {
    enrichmentStatus.mockResolvedValue({ state, job_id: 'j' })
    run()
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate).toHaveBeenCalledWith({ contact: CONTACT, accountCompanyName: 'ACME', resume: true })
  })

  it.each([
    { state: 'unknown', job_id: 'j' },
    { state: 'done', job_id: 'j', result: {} },
  ])('SAIT DIRE NON — rien à reprendre quand le job est $state', async status => {
    enrichmentStatus.mockResolvedValue(status)
    run()
    await waitFor(() => expect(enrichmentStatus).toHaveBeenCalled())
    expect(mutate).not.toHaveBeenCalled()
  })

  it('ne sonde pas quand un suivi est déjà en cours dans ce composant', async () => {
    run({ isPending: true })
    expect(enrichmentStatus).not.toHaveBeenCalled()
  })

  it('une sonde en erreur ne lance rien et ne remonte rien', async () => {
    enrichmentStatus.mockRejectedValue(new Error('réseau'))
    run()
    await waitFor(() => expect(enrichmentStatus).toHaveBeenCalled())
    expect(mutate).not.toHaveBeenCalled()
  })
})
