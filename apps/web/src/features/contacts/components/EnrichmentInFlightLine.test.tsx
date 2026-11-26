import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ContactsApiModule from '@/features/contacts/api'
import { i18n } from '@/i18n'

const enrichmentInFlight = vi.fn()
vi.mock('@/features/contacts/api', async () => {
  const actual = await vi.importActual<typeof ContactsApiModule>('@/features/contacts/api')
  return {
    ...actual,
    contactsApi: { ...actual.contactsApi, enrichmentInFlight: (...a: unknown[]) => enrichmentInFlight(...a) },
  }
})

import { resetEnrichmentInFlight } from '@/features/contacts/hooks/useEnrichmentInFlight'
import { EnrichmentInFlightLine } from './EnrichmentInFlightLine'

describe('EnrichmentInFlightLine — #AM.39', () => {
  beforeEach(async () => {
    enrichmentInFlight.mockReset()
    resetEnrichmentInFlight()
    await i18n.changeLanguage('fr')
  })

  it('dit combien d’enrichissements sont en cours', async () => {
    enrichmentInFlight.mockResolvedValue({ contacts: [{ contactId: 'c1' }, { contactId: 'c2' }] })
    render(<EnrichmentInFlightLine />)
    expect(await screen.findByTestId('enrichment-in-flight')).toHaveTextContent('2 enrichissements en cours')
  })

  it('NON : aucun job en vol, aucune ligne', async () => {
    enrichmentInFlight.mockResolvedValue({ contacts: [] })
    render(<EnrichmentInFlightLine />)
    await vi.waitFor(() => expect(enrichmentInFlight).toHaveBeenCalled())
    expect(screen.queryByTestId('enrichment-in-flight')).toBeNull()
  })
})
