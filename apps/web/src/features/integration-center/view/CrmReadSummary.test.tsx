import type { CrmReadStatus } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { CrmReadSummary } from './CrmReadSummary'

// #4590.2 — la zone nomme chaque CRM branché avec sa date de dernière lecture ; aucun branché se DIT ;
// une date absente se dit « jamais lu » ; un échec d'API se dit (jamais une zone vide).
const mocks = vi.hoisted(() => ({
  state: { data: [] as CrmReadStatus[] | undefined, isError: false, isLoading: false },
}))
vi.mock('@/features/crm-import/api', () => ({ useCrmReadStatus: () => mocks.state }))

function row(over: Partial<CrmReadStatus>): CrmReadStatus {
  return {
    provider: 'hubspot',
    accountLabel: null,
    objects: ['accounts'],
    incremental: null,
    lastSyncAt: null,
    lastError: null,
    conflicts: 0,
    conflictItems: [],
    ...over,
  } as CrmReadStatus
}

beforeEach(async () => {
  mocks.state = { data: [], isError: false, isLoading: false }
  await i18n.changeLanguage('fr')
})

describe('#4590.2 — CrmReadSummary', () => {
  it('OUI : chaque CRM branché est nommé avec sa date de dernière lecture', () => {
    mocks.state.data = [
      row({ provider: 'hubspot', lastSyncAt: '2026-10-25T08:00:00.000Z' }),
      row({ provider: 'attio', lastSyncAt: '2026-10-20T09:30:00.000Z' }),
    ]
    render(<CrmReadSummary />)
    const rows = screen.getAllByTestId('crm-read-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('HubSpot')).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent('25/10/2026')
    expect(rows[1]).toHaveTextContent('Attio')
    expect(rows[1]).toHaveTextContent('20/10/2026')
    expect(screen.queryByText(/jamais lu/i)).not.toBeInTheDocument()
  })

  it('OUI : une date absente se dit « jamais lu », jamais la date du jour', () => {
    mocks.state.data = [row({ provider: 'hubspot', lastSyncAt: null })]
    render(<CrmReadSummary />)
    expect(screen.getByTestId('crm-read-row')).toHaveTextContent('jamais lu')
    expect(screen.getByTestId('crm-read-row').textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('OUI : aucun CRM branché, la zone le dit', () => {
    mocks.state.data = []
    render(<CrmReadSummary />)
    expect(screen.getByTestId('crm-read-none')).toHaveTextContent('Aucun CRM branché')
    expect(screen.queryByTestId('crm-read-row')).not.toBeInTheDocument()
  })

  it('NON : un échec de l’API se dit « état de lecture indisponible », pas « aucun CRM branché »', () => {
    mocks.state = { data: undefined, isError: true, isLoading: false }
    render(<CrmReadSummary />)
    expect(screen.getByTestId('crm-read-unavailable')).toHaveTextContent('État de lecture indisponible')
    expect(screen.queryByTestId('crm-read-none')).not.toBeInTheDocument()
  })

  it('NON : en chargement, rien n’est affirmé', () => {
    mocks.state = { data: undefined, isError: false, isLoading: true }
    render(<CrmReadSummary />)
    expect(screen.queryByTestId('crm-read-none')).not.toBeInTheDocument()
    expect(screen.queryByTestId('crm-read-unavailable')).not.toBeInTheDocument()
  })
})
