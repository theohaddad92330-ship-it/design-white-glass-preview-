import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmReprisalCandidates } from '../api'
import { chooseOption } from '@/test/select'

const candidates = vi.fn()
const accounts = vi.fn()
const createMission = vi.fn()

vi.mock('../api', () => ({
  useCrmReprisalCandidates: () => candidates(),
  useCreateMissionFromCrmReprisal: () => createMission(),
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => accounts() }))

const { CrmReprisalProposal } = await import('./CrmReprisalProposal')

function result(over: Partial<CrmReprisalCandidates> = {}): CrmReprisalCandidates {
  return { available: false, provider: null, deals: [], ...over }
}

beforeEach(() => {
  cleanup()
  candidates.mockReset().mockReturnValue({ data: result(), isLoading: false })
  accounts.mockReset().mockReturnValue({
    data: { pages: [{ data: [{ id: 'acc-1', company_name: 'Lacoste' }] }] },
  })
  createMission.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
})

/**
 * #2562 — LA PROPOSITION DE REPRISE, dans l'état vide de « Missions › En cours ».
 *
 * Quatre principes tenus par ces tests :
 *  1. rien ne s'affiche tant qu'il n'y a rien à proposer (chargement compris —
 *     un « rien à proposer » affirmé pendant le chargement mentirait une fois
 *     sur deux) ;
 *  2. la correspondance se montre, NOMMÉE, jamais un littéral d'éditeur ;
 *  3. chaque deal se lit champ par champ, l'absence NOMMÉE plutôt que tue ;
 *  4. la création exige un COMPTE choisi par la personne — jamais deviné —
 *     avant que le clic (qui EST la décision) ne parte.
 */
describe('CrmReprisalProposal', () => {
  it('rien ne s’affiche sans proposition disponible', () => {
    candidates.mockReturnValue({ data: result({ available: false }), isLoading: false })
    render(<CrmReprisalProposal />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('rien ne s’affiche PENDANT le chargement — un vide affirmé trop tôt mentirait', () => {
    candidates.mockReturnValue({ data: undefined, isLoading: true })
    render(<CrmReprisalProposal />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('montre la correspondance NOMMÉE et chaque deal, champ par champ', () => {
    candidates.mockReturnValue({
      data: result({
        available: true,
        provider: 'hubspot',
        deals: [
          {
            dealId: '1',
            name: 'Renouvellement Q4',
            stage: 'negotiation',
            stageLabel: 'Négociation',
            amount: '24000',
            isClosed: false,
            isWon: null,
          },
        ],
      }),
      isLoading: false,
    })
    render(<CrmReprisalProposal />)
    expect(screen.getByText(/dans hubspot/i)).toBeInTheDocument()
    expect(screen.getByText('Renouvellement Q4')).toBeInTheDocument()
    expect(screen.getByText('Négociation')).toBeInTheDocument()
  })

  it('NOMME un nom de deal absent plutôt qu’une ligne muette', () => {
    candidates.mockReturnValue({
      data: result({
        available: true,
        provider: 'hubspot',
        deals: [{ dealId: '1', name: null, stage: null, stageLabel: null, amount: null, isClosed: false, isWon: null }],
      }),
      isLoading: false,
    })
    render(<CrmReprisalProposal />)
    expect(screen.getByText(/nom du deal non renseigné/i)).toBeInTheDocument()
  })

  it('le geste de création exige un COMPTE choisi — le bouton reste désactivé sans lui', async () => {
    const mutate = vi.fn()
    createMission.mockReturnValue({ mutate, isPending: false })
    candidates.mockReturnValue({
      data: result({
        available: true,
        provider: 'hubspot',
        deals: [
          {
            dealId: 'd-1',
            name: 'Renouvellement Q4',
            stage: null,
            stageLabel: null,
            amount: null,
            isClosed: false,
            isWon: null,
          },
        ],
      }),
      isLoading: false,
    })
    render(<CrmReprisalProposal />)
    const cta = screen.getByRole('button', { name: /créer cette mission/i })
    expect(cta).toBeDisabled()

    await chooseOption(screen.getByRole('combobox'), 'acc-1')
    expect(cta).toBeEnabled()
    await userEvent.click(cta)
    expect(mutate).toHaveBeenCalledWith({ accountId: 'acc-1', label: 'Renouvellement Q4', crmDealId: 'd-1' })
  })
})
