import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { MissionBillingBadge } from './MissionBillingBadge'

// #2408 (épopée #2979) — UN badge sur la ligne de mission, qui mène à Facturation. Pas de vue ni de tuile de plus.
describe('MissionBillingBadge', () => {
  it.each([
    ['invoice_blocked', 'Facture bloquée'],
    ['invoice_overdue', 'Facture échue'],
    ['payment_late', 'Paiement en retard'],
  ] as const)('%s → « %s », un lien vers Facturation', async (alert, label) => {
    renderWithRouter(<MissionBillingBadge alert={alert} />)
    const link = await screen.findByRole('link', { name: new RegExp(label) })
    expect(link).toHaveAttribute('href', '/missions/facturation')
  })

  it('SAIT DIRE NON — sans alerte (ou sans droit de lecture), rien : ni badge ni « tout va bien »', () => {
    const { container } = renderWithRouter(<MissionBillingBadge alert={null} />)
    expect(container.textContent).toBe('')
    const second = renderWithRouter(<MissionBillingBadge alert={undefined} />)
    expect(second.container.textContent).toBe('')
  })
})
