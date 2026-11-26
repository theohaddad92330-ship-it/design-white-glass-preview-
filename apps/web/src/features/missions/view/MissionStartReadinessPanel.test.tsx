import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeMissionStartReadiness, type MissionStartReadiness } from '@bellum/contracts'

const readiness = vi.fn()
const mutate = vi.fn()
vi.mock('../api', () => ({
  useMissionStartReadiness: (_id: string, enabled: boolean) => (enabled ? readiness() : { data: undefined }),
  useMissionStartCheck: () => ({ mutate, isPending: false }),
}))

const { MissionStartReadinessPanel } = await import('./MissionStartReadinessPanel')

const ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-23T10:00:00Z')
const state = (over: Partial<Parameters<typeof computeMissionStartReadiness>[0]> = {}): MissionStartReadiness =>
  computeMissionStartReadiness({
    declared: [],
    data: { consultantAssigned: true, startDate: '2026-10-01', dailyRate: 650 },
    now: NOW,
    ...over,
  })

beforeEach(() => {
  cleanup()
  readiness.mockReset()
  mutate.mockReset()
})

describe('MissionStartReadinessPanel — #2338 / #2409', () => {
  it('une mission née sans accord : « Accords à confirmer », verdict bloqué, manques NOMMÉS', () => {
    readiness.mockReturnValue({ data: state() })
    render(<MissionStartReadinessPanel missionId={ID} status="onboarding" />)
    expect(screen.getByText('Accords à confirmer')).toBeInTheDocument()
    expect(screen.getByText('Bloqué')).toBeInTheDocument()
    // #2953 (jumeau) — chaque manque est NOMMÉ une seule fois, par sa ligne ; plus de phrase qui les répète.
    expect(screen.queryByTestId('start-missing')).toBeNull()
    expect(screen.queryByText(/avant de passer/i)).toBeNull()
    for (const label of ['Accord du client', 'Accord du consultant', 'Contrat ou bon de commande signé']) {
      expect(screen.getAllByText(label)).toHaveLength(1)
    }
  })

  it('un geste enregistré montre sa date et sa preuve, et se retire', async () => {
    readiness.mockReturnValue({
      data: state({
        declared: [
          { key: 'client_agreement', confirmedAt: '2026-09-20T10:00:00Z', confirmedBy: 'u1', proof: 'mail du 20/09' },
        ],
      }),
    })
    render(<MissionStartReadinessPanel missionId={ID} status="onboarding" />)
    const row = screen.getByTestId('start-item-client_agreement')
    expect(row).toHaveTextContent('mail du 20/09')
    await userEvent.click(within(row).getByRole('button', { name: /Retirer/ }))
    expect(mutate).toHaveBeenCalledWith({ action: 'withdraw', item: 'client_agreement' })
  })

  it('#2409.7 — confirmer exige une preuve : le bouton reste inerte tant qu’elle est vide', async () => {
    readiness.mockReturnValue({ data: state() })
    render(<MissionStartReadinessPanel missionId={ID} status="draft" />)
    const row = screen.getByTestId('start-item-consultant_agreement')
    await userEvent.click(within(row).getByRole('button', { name: /Confirmer/ }))
    const save = within(row).getByRole('button', { name: /Enregistrer/ })
    expect(save).toBeDisabled()
    await userEvent.type(within(row).getByRole('textbox'), 'Appel du 22/09, TJM accepté')
    await userEvent.click(save)
    expect(mutate).toHaveBeenCalledWith({
      action: 'confirm',
      input: { item: 'consultant_agreement', proof: 'Appel du 22/09, TJM accepté' },
    })
  })

  it('un prérequis DÉRIVÉ ne se coche pas à la main', () => {
    readiness.mockReturnValue({
      data: state({ data: { consultantAssigned: false, startDate: null, dailyRate: null } }),
    })
    render(<MissionStartReadinessPanel missionId={ID} status="draft" />)
    expect(screen.getByText('Incomplet')).toBeInTheDocument()
    const row = screen.getByTestId('start-item-start_date')
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('ne s’affiche PAS sur une mission déjà démarrée (aucune lecture)', () => {
    readiness.mockReturnValue({ data: state() })
    const { container } = render(<MissionStartReadinessPanel missionId={ID} status="active" />)
    expect(container).toBeEmptyDOMElement()
    expect(readiness).not.toHaveBeenCalled()
  })
})
