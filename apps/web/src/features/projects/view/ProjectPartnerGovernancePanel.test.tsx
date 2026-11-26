import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}))

import { ProjectPartnerGovernancePanel } from './ProjectPartnerGovernancePanel'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const relation = (id: string, name: string, governanceStatus: string, risk: string, nextValidation: string | null) => ({
  id,
  name,
  governanceStatus,
  governanceReadiness: { framed: [], missing: [], risk, accountsConcerned: [], profilesConcerned: [], nextValidation },
})

/** Route les deux lectures par chemin : le panneau ne dépend pas de leur ordre. */
function serve(partners: unknown, relations: unknown) {
  apiFetch.mockImplementation((arg?: { path: string }) => {
    const path = arg?.path
    if (path === '/accounts/acc-1/partners') return Promise.resolve({ partners })
    if (path === '/partners') return Promise.resolve(relations)
    return Promise.resolve(null)
  })
}

describe('ProjectPartnerGovernancePanel (#3270.6, Opportunité)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('nomme le statut, le risque et la prochaine validation de l’ESN rang 2 liée au compte', async () => {
    serve(
      [{ id: 'p1', name: 'Astek', rank: 'rank2', partner_relation_id: 'r1' }],
      [relation('r1', 'Astek', 'rules_missing', 'blocking', 'non_circumvention')],
    )
    render(<ProjectPartnerGovernancePanel accountId="acc-1" />, { wrapper })
    await waitFor(() => expect(screen.getByText('Astek')).toBeInTheDocument())
    expect(screen.getByText('Règles manquantes')).toBeInTheDocument()
    expect(screen.getByText(/Cadre insuffisant/)).toBeInTheDocument()
    expect(screen.getByText(/Non-contournement/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ouvrir Partenaires/ })).toHaveAttribute('href', '/accounts/partners')
  })

  it('une ESN rang 2 sans relation gouvernée ne fait aucune ligne : le nom seul ne dessine pas une route', async () => {
    serve([{ id: 'p1', name: 'Inconnue', rank: 'rank2', partner_relation_id: null }], [])
    const { container } = render(<ProjectPartnerGovernancePanel accountId="acc-1" />, { wrapper })
    await waitFor(() => expect(apiFetch.mock.calls.filter(([arg]) => arg?.path).length).toBe(2))
    expect(container).toBeEmptyDOMElement()
  })

  it('opportunité sans compte : aucune lecture, aucun rendu', () => {
    const { container } = render(<ProjectPartnerGovernancePanel accountId={null} />, { wrapper })
    expect(apiFetch).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it('lecture en échec : rien — jamais un cadre « vide » ni « complet »', async () => {
    apiFetch.mockImplementation((arg?: { path: string }) =>
      arg?.path ? Promise.reject(new Error('500')) : Promise.resolve(null),
    )
    const { container } = render(<ProjectPartnerGovernancePanel accountId="acc-1" />, { wrapper })
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
