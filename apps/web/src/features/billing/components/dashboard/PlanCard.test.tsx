import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { BillingViewModel } from '../../model/billing-view-model'
import { PlanCard } from './PlanCard'

const MODEL: BillingViewModel = {
  planLabel: 'Équipe',
  planStatus: 'active',
  benefits: ['Pilotage d’équipe'],
  renewalLabel: 'Renouvellement le 1er novembre 2026',
  invoices: [],
  hasSubscription: true,
  currentPlanId: 'team',
  isBillingOwner: true,
  seatsUsed: 4,
  seatsTotal: 6,
  seatsLabel: '4 / 6',
  seatsOverBy: 0,
}

/**
 * Refonte Théo (PR12, `.v12-setting-block` « Ton abonnement ») — le bloc de
 * réglage : titre h2 au-dessus d'un filet, puis des LIGNES h3 (formule, sièges,
 * renouvellement) dans cet ordre, l'état ou le geste à droite. Aucun crédit.
 */
describe('PlanCard — grammaire Théo', () => {
  it('le titre du bloc, puis formule · sièges · renouvellement, et aucun crédit', () => {
    const { container } = render(<PlanCard model={MODEL} managing={false} onManage={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    const rows = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    expect(rows).toEqual(['Équipe', 'Sièges', 'Renouvellement'])
    expect(container.textContent).not.toMatch(/crédit/i)
  })

  it('la formule porte son statut teinté ; le geste est sur la ligne de renouvellement', () => {
    render(<PlanCard model={MODEL} managing={false} onManage={vi.fn()} />)
    const plan = screen.getByRole('heading', { level: 3, name: 'Équipe' }).closest('div')!.parentElement!
    expect(within(plan).getByText('Actuel')).toBeInTheDocument()
    const renewal = screen.getByRole('heading', { level: 3, name: 'Renouvellement' }).closest('div')!.parentElement!
    expect(within(renewal).getByRole('button')).toBeInTheDocument()
  })

  it('NON : un membre ne voit pas le geste, mais la phrase qui dit qui gère', () => {
    render(<PlanCard model={{ ...MODEL, isBillingOwner: false }} managing={false} onManage={vi.fn()} />)
    expect(screen.queryByRole('heading', { level: 3, name: 'Renouvellement' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // #4669.1 — l'écart se NOMME en toutes lettres, jamais une fraction « 2 / 1 ».
  it('NON : plus de sièges occupés que payés — la phrase nomme l’écart, aucune fraction impossible', () => {
    render(
      <PlanCard
        model={{ ...MODEL, seatsUsed: 2, seatsTotal: 1, seatsLabel: '2', seatsOverBy: 1 }}
        managing={false}
        onManage={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 siège de plus que ton abonnement/)).toBeInTheDocument()
    expect(screen.queryByText(/2 \/ 1/)).toBeNull()
  })

  it('témoin : sans écart, aucune phrase d’écart', () => {
    render(<PlanCard model={MODEL} managing={false} onManage={vi.fn()} />)
    expect(screen.queryByText(/de plus que ton abonnement/)).toBeNull()
  })
})
