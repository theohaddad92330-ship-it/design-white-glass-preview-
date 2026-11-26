import type { IntegrationExchange } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useCrmExchanges } from '@/features/crm-import/api'
import { HistoryTab } from './HistoryTab'

vi.mock('@/features/crm-import/api', () => ({ useCrmExchanges: vi.fn() }))

function set(items: IntegrationExchange[]) {
  vi.mocked(useCrmExchanges).mockReturnValue({ data: items, isLoading: false } as unknown as ReturnType<
    typeof useCrmExchanges
  >)
}

const read: IntegrationExchange = {
  id: '1',
  at: '2026-10-22T08:40:00.000Z',
  provider: 'hubspot',
  kind: 'read',
  entityType: 'contact',
  counts: { created: 0, updated: 38, skipped: 0, conflicts: 2 },
  result: 'to_review',
  detail: null,
}

describe('Théo D settings-integrations.N4 — l’onglet Historique', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('dit l’outil, l’opération et le résultat rapporté', () => {
    set([read])
    render(<HistoryTab />)
    expect(screen.getByText('HubSpot')).toBeInTheDocument()
    expect(screen.getByText('Lecture · 38 contacts touchés')).toBeInTheDocument()
    expect(screen.getByText('2 changements à relire')).toBeInTheDocument()
  })

  it('un refus garde la raison de l’outil telle quelle', () => {
    set([{ ...read, id: '2', result: 'refused', detail: '401 invalid_grant', counts: null }])
    render(<HistoryTab />)
    expect(screen.getByText('401 invalid_grant')).toBeInTheDocument()
    expect(screen.getByText('Refusé par l’outil')).toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — aucune opération : une phrase, pas un tableau de zéros', () => {
    set([])
    render(<HistoryTab />)
    expect(screen.getByText(/Aucune opération pour l’instant/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
