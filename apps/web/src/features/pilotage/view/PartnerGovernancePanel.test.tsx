import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}))

import { PartnerGovernancePanel } from './PartnerGovernancePanel'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const relation = (name: string, governanceStatus: string, risk: string, nextValidation: string | null) => ({
  id: name,
  name,
  governanceStatus,
  governanceReadiness: {
    framed: [],
    missing: nextValidation ? [nextValidation] : [],
    risk,
    accountsConcerned: [],
    profilesConcerned: [],
    nextValidation,
  },
})

describe('PartnerGovernancePanel (#3270.6, Pilotage)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('nomme la prochaine validation de la relation la plus risquée et mène à Partenaires', async () => {
    apiFetch.mockResolvedValueOnce([
      relation('Astek', 'rules_missing', 'blocking', 'non_circumvention'),
      relation('Orsan Conseil', 'active', 'none', null),
    ])
    render(<PartnerGovernancePanel />, { wrapper })
    await waitFor(() => expect(screen.getByText('Astek')).toBeInTheDocument())
    expect(screen.getByText(/Non-contournement/)).toBeInTheDocument()
    expect(screen.getByText(/Règles manquantes/)).toBeInTheDocument()
    expect(screen.queryByText('Orsan Conseil')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /partenaires/i })).toHaveAttribute('href', '/accounts/partners')
  })

  it('aucune relation : le panneau ne se rend pas (une absence ne fait aucune ligne)', async () => {
    apiFetch.mockResolvedValueOnce([])
    const { container } = render(<PartnerGovernancePanel />, { wrapper })
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('une lecture en échec ne se fait pas passer pour « rien à cadrer »', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    const { container } = render(<PartnerGovernancePanel />, { wrapper })
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
