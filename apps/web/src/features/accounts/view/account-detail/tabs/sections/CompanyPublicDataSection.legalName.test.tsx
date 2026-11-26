import { SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompanyPublicDataSection } from './CompanyPublicDataSection'

vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
const mutate = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/hooks/useRefreshDimension', () => ({
  useRefreshDimension: () => ({ mutate, isPending: false }),
}))

// K1 recette 22/10 (Decathlon, analysé 6 jours plus tôt) — `legal_name` n'est collecté que depuis le 21/10 :
// l'écran DIT que la collecte est antérieure et propose le geste existant, au lieu d'un libellé muet.
const FINANCIALS = [{ year: 2024, revenue: 5e6, net_result: 1e5 }]
const OLD_COLLECTION = '2026-10-16T08:00:00.000Z'
const FRESH_COLLECTION = new Date(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals as string) + 86_400_000).toISOString()

describe('FinancialsCard — nom légal absent (K1, un correctif de collecte rattrape l’existant)', () => {
  it('collecte antérieure au 21/10 : dit que le nom légal est collecté depuis le 21/10 et propose d’actualiser', () => {
    render(
      <CompanyPublicDataSection
        analysis={{ financials_history: FINANCIALS }}
        accountId="acc-1"
        signalsCollectedAt={OLD_COLLECTION}
      />,
    )
    expect(screen.getByText(/nom légal collecté depuis le 21\/10/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Actualiser les signaux/ }))
    expect(mutate).toHaveBeenCalledWith('signals')
  })

  it('⚠️ SAIT DIRE NON — collecte postérieure à la capacité : aucun avis (le nom manque pour une autre raison)', () => {
    render(
      <CompanyPublicDataSection
        analysis={{ financials_history: FINANCIALS }}
        accountId="acc-1"
        signalsCollectedAt={FRESH_COLLECTION}
      />,
    )
    expect(screen.queryByText(/nom légal collecté depuis le 21\/10/i)).toBeNull()
  })

  it('⚠️ SAIT DIRE NON — nom légal présent : aucun avis, même sur une collecte antérieure', () => {
    render(
      <CompanyPublicDataSection
        analysis={{ legal_name: 'DECATHLON SE', financials_history: FINANCIALS }}
        accountId="acc-1"
        signalsCollectedAt={OLD_COLLECTION}
      />,
    )
    expect(screen.queryByText(/nom légal collecté depuis le 21\/10/i)).toBeNull()
  })
})
