import type { MissionCommercialTerms } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionCostSourceForm } from './MissionCostSourceForm'

const TERMS: MissionCommercialTerms = {
  missionId: '11111111-1111-4111-8111-111111111111',
  channel: 'direct',
  loadedDailyCostCents: 60_000,
  requiresPo: false,
  poNumber: null,
  poOtherMissions: [],
  billingCadence: null,
  partnerCommissionDailyCents: null,
  noticeDays: null,
  notes: null,
  updatedAt: '2026-09-17T00:00:00.000Z',
}

afterEach(cleanup)

describe('MissionCostSourceForm (#2420.6, #2420.7, #2420.9, #2420.10)', () => {
  it('freelance : TJM fournisseur et commission en centimes, et le coût chargé suit leur somme', async () => {
    const onSave = vi.fn()
    render(<MissionCostSourceForm terms={TERMS} onSave={onSave} saving={false} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'freelance' }))
    await user.type(screen.getByLabelText('TJM fournisseur (€)'), '550')
    await user.type(screen.getByLabelText('Commission fournisseur (€/jour)'), '20')
    await user.type(screen.getByLabelText('Devise du TJM'), 'eur')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la source du coût' }))
    expect(onSave).toHaveBeenCalledWith({
      costSource: 'freelance',
      currency: 'EUR',
      costCurrency: null,
      costBreakdown: { supplierDailyRateCents: 55_000, supplierCommissionDailyCents: 2_000 },
      loadedDailyCostCents: 57_000,
    })
  })

  it('un champ vide reste ABSENT — jamais un zéro inventé ; zéro saisi reste zéro', async () => {
    const onSave = vi.fn()
    render(<MissionCostSourceForm terms={TERMS} onSave={onSave} saving={false} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'partenaire' }))
    await user.type(screen.getByLabelText('Part du partenaire (%)'), '0')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la source du coût' }))
    const saved = onSave.mock.calls[0]?.[0]
    expect(saved.costBreakdown).toEqual({ partnerSplitPercent: 0 })
    // Sans prix d'achat, le coût chargé saisi n'est pas touché.
    expect(saved).not.toHaveProperty('loadedDailyCostCents')
  })

  it('salarié : aucun champ « salaire », l’origine du coût se choisit, le standard porte sa date', async () => {
    const onSave = vi.fn()
    render(<MissionCostSourceForm terms={TERMS} onSave={onSave} saving={false} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'salarié' }))
    expect(screen.queryByLabelText(/salaire/i)).toBeNull()
    expect(screen.getByText(/Aucun salaire n’est demandé/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Coût importé' }))
    await user.type(screen.getByLabelText('Coût standard (€/jour)'), '500')
    await user.type(screen.getByLabelText('Coût standard validé le'), '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la source du coût' }))
    expect(onSave.mock.calls[0]?.[0].costBreakdown).toEqual({
      employeeCostOrigin: 'imported',
      standardDailyCostCents: 50_000,
      standardCostValidatedOn: '2026-09-01',
    })
  })

  it('relit ce qui est en base', () => {
    render(
      <MissionCostSourceForm
        terms={{ ...TERMS, costSource: 'fixed_price', costBreakdown: { fixedPriceTeamTimeCostCents: 1_650_000 } }}
        onSave={vi.fn()}
        saving={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'forfait' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Temps équipe valorisé (€)')).toHaveValue(16_500)
  })
})
