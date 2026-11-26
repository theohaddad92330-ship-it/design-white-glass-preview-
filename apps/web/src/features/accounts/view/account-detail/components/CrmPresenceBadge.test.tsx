import type { Account } from '@bellum/contracts'
import type { CrmPresence } from '@/features/crm/api'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CrmPresenceBadge } from './CrmPresenceBadge'

const useCrmPresenceMock = vi.fn()
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({
  useCrmPresence: (...args: unknown[]) => useCrmPresenceMock(...args),
}))

// #4680 — la présence se lit AUSSI dans la provenance en base (contacts importés), sans connecteur live.
const provenanceMock = vi.fn()
vi.mock('@/features/crm/hooks/useAccountCrmProvenance', () => ({
  useAccountCrmProvenance: () => provenanceMock(),
}))

const exportsMock = vi.fn()
vi.mock('@/features/crm/api', () => ({ crmPushApi: { accountExports: (...a: unknown[]) => exportsMock(...a) } }))
const wrap = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {node}
  </QueryClientProvider>
)

const account = { id: 'a-1', company_name: 'ACME', website: 'https://acme.fr', siren: '123456789' } as Account

function presence(overrides: Partial<CrmPresence>): CrmPresence {
  return {
    provider: null,
    matched: false,
    contactsCount: 0,
    contacts: [],
    openDeals: [],
    lastActivityAt: null,
    ...overrides,
  }
}

describe('CrmPresenceBadge (present-only)', () => {
  it('renders nothing while the query is still loading', () => {
    useCrmPresenceMock.mockReturnValue({ data: undefined })
    const { container } = render(wrap(<CrmPresenceBadge account={account} />))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when no CRM is connected (provider null)', () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: null }) })
    const { container } = render(wrap(<CrmPresenceBadge account={account} />))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the CRM is connected but did not match', () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: 'hubspot', matched: false }) })
    const { container } = render(wrap(<CrmPresenceBadge account={account} />))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the « déjà dans ton CRM » badge on a match', () => {
    useCrmPresenceMock.mockReturnValue({
      data: presence({ provider: 'hubspot', matched: true, contactsCount: 2 }),
    })
    render(wrap(<CrmPresenceBadge account={account} />))
    expect(screen.getByText('Dans HubSpot')).toBeInTheDocument()
    expect(screen.queryByText('Déjà dans ton CRM')).toBeNull()
  })

  it('#4188.3 — lien vers l’enregistrement seulement quand l’id externe est connu (un envoi enregistré)', async () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: 'hubspot', matched: true }) })
    exportsMock.mockResolvedValue({
      items: [{ provider: 'hubspot', record_url: 'https://app.hubspot.com/contacts/1/record/0-2/9' }],
    })
    render(wrap(<CrmPresenceBadge account={account} />))
    const link = await screen.findByTestId('crm-presence-record-link')
    expect(link).toHaveAttribute('href', 'https://app.hubspot.com/contacts/1/record/0-2/9')
  })

  it('#4188.3 — sans id externe connu : aucun lien, jamais un lien deviné', async () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: 'hubspot', matched: true }) })
    exportsMock.mockResolvedValue({ items: [] })
    render(wrap(<CrmPresenceBadge account={account} />))
    await screen.findByText('Dans HubSpot')
    expect(screen.queryByTestId('crm-presence-record-link')).toBeNull()
  })
})

describe('CrmPresenceBadge — contacts importés (#4680)', () => {
  const known = (importedAt: string | null) => ({
    accountFromCrm: true,
    contacts: [],
    knownContacts: { count: 1, importedAt },
  })

  it('sans connecteur mais avec un contact importé : la présence est dite, et nommée « Import de ton CRM »', () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: null }) })
    provenanceMock.mockReturnValue(known('2026-10-20T08:00:00.000Z'))
    render(wrap(<CrmPresenceBadge account={account} />))
    expect(screen.getByTestId('crm-presence-imported')).toHaveTextContent('Import de ton CRM')
    // Aucun nom de fournisseur deviné.
    expect(screen.queryByText(/HubSpot|Salesforce|Pipedrive/)).toBeNull()
  })

  it('l’infobulle dit la date de l’import', async () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: null }) })
    provenanceMock.mockReturnValue(known('2026-10-20T08:00:00.000Z'))
    render(wrap(<CrmPresenceBadge account={account} />))
    await act(async () => {
      screen.getByTestId('crm-presence-imported').parentElement?.focus()
    })
    expect((await screen.findAllByText(/importé le/)).length).toBeGreaterThan(0)
  })

  it('SAIT DIRE NON — sans date de trace : « date d’import non mesurée », jamais une date devinée', async () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: null }) })
    provenanceMock.mockReturnValue(known(null))
    render(wrap(<CrmPresenceBadge account={account} />))
    await act(async () => {
      screen.getByTestId('crm-presence-imported').parentElement?.focus()
    })
    expect((await screen.findAllByText(/date d’import non mesurée/)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/importé le/)).toBeNull()
  })

  it('SAIT DIRE NON — ni connecteur ni contact importé : le badge ne dit rien, comme avant', () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: null }) })
    provenanceMock.mockReturnValue(null)
    const { container } = render(wrap(<CrmPresenceBadge account={account} />))
    expect(container).toBeEmptyDOMElement()
  })

  it('un connecteur qui retrouve le compte garde sa présence habituelle (l’import ne la remplace pas)', () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: 'hubspot', matched: true, contactsCount: 2 }) })
    provenanceMock.mockReturnValue(known('2026-10-20T08:00:00.000Z'))
    render(wrap(<CrmPresenceBadge account={account} />))
    expect(screen.getByText('Dans HubSpot')).toBeInTheDocument()
    expect(screen.queryByTestId('crm-presence-imported')).toBeNull()
  })
})
