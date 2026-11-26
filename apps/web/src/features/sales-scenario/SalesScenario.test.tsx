import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SalesScenario } from './SalesScenario'
import { useSalesScenarioStore } from './sales-scenario-store'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const listAccounts = vi.fn()
vi.mock('@/features/accounts/api', () => ({
  accountsApi: { list: (...args: unknown[]) => listAccounts(...args) },
}))
const listByAccount = vi.fn()
const rankByAccount = vi.fn()
vi.mock('@/features/contacts/api', () => ({
  contactsApi: {
    listByAccount: (...args: unknown[]) => listByAccount(...args),
    rankByAccount: (...args: unknown[]) => rankByAccount(...args),
  },
}))

function renderScenario() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SalesScenario />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  navigate.mockReset()
  act(() => useSalesScenarioStore.getState().stop())
  listAccounts.mockReset().mockResolvedValue({
    data: [{ id: 'acc-9', company_name: 'Hexagone Assurances' }],
    pagination: { total: 1, limit: 1, offset: 0 },
  })
  listByAccount.mockReset().mockResolvedValue([
    { id: 'ct-1', full_name: 'Paul Durand' },
    { id: 'ct-4', full_name: 'Claire Martin' },
  ])
  rankByAccount.mockReset().mockResolvedValue({ ranked: [{ contact_id: 'ct-4', position: 1 }] })
})

// #2731.2 — un scénario commercial réel, joué dans le produit, sur les données de l'espace.
describe('SalesScenario', () => {
  it('ne rend rien tant que personne ne l’a lancé', () => {
    renderScenario()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(listAccounts).not.toHaveBeenCalled()
  })

  it('part du DERNIER compte analysé de l’espace et de son interlocuteur classé premier', async () => {
    act(() => useSalesScenarioStore.getState().start())
    renderScenario()

    expect(await screen.findByText(/Hexagone Assurances/)).toBeInTheDocument()
    expect(listAccounts).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', sort: 'date_desc' }))

    fireEvent.click(screen.getByRole('button', { name: /y aller/i }))
    expect(navigate).toHaveBeenCalledWith({ to: '/accounts/acc-9' })

    fireEvent.click(screen.getByRole('button', { name: /étape suivante/i }))
    expect(await screen.findByText(/Claire Martin/)).toBeInTheDocument()
    expect(navigate).toHaveBeenLastCalledWith({ to: '/contacts/ct-4' })
  })

  it('se termine et se RELANCE autant qu’on veut', async () => {
    act(() => useSalesScenarioStore.getState().start())
    renderScenario()
    await screen.findByText(/Hexagone Assurances/)
    fireEvent.click(screen.getByRole('button', { name: /quitter le scénario/i }))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()

    act(() => useSalesScenarioStore.getState().start())
    expect(await screen.findByText(/Hexagone Assurances/)).toBeInTheDocument()
  })

  it('SAIT DIRE NON — sans compte analysé, il propose d’en analyser un, sans rien nommer', async () => {
    listAccounts.mockResolvedValue({ data: [], pagination: { total: 0, limit: 1, offset: 0 } })
    act(() => useSalesScenarioStore.getState().start())
    renderScenario()

    await waitFor(() => expect(screen.getByRole('region')).toHaveTextContent(/analyse/i))
    expect(listByAccount).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /étape suivante/i })).not.toBeInTheDocument()
  })
})
