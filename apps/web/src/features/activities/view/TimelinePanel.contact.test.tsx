import type { Activity } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Timeline } from '../api'
import { TimelinePanel } from './TimelinePanel'

const timeline = vi.fn()
const sync = vi.fn()

vi.mock('../hooks/useTimeline', () => ({
  useTimeline: () => timeline(),
  useLogActivity: () => ({ mutate: vi.fn(), isPending: false }),
  useSyncActivities: () => ({ mutate: sync, isPending: false }),
  useRemoveActivity: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('./NoteCascadeProposal', () => ({ NoteCascadeProposal: () => null }))

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    kind: 'email',
    source: 'manual',
    direction: 'outbound',
    subject: 'Deux profils conformité',
    body: null,
    bodyTruncated: false,
    bodyRedacted: false,
    occurredAt: '2026-08-14T09:00:00.000Z',
    durationSeconds: null,
    accountId: 'acc-1',
    contactId: null,
    projectId: null,
    linkReason: null,
    userId: null,
    authorName: null,
    participants: [],
    externalId: null,
    externalUrl: null,
    createdAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  }
}

function ok(items: Activity[]) {
  const engagement: Timeline['engagement'] = {
    total: items.length,
    lastOutboundAt: null,
    lastInboundAt: null,
    daysSinceLastActivity: 3,
    awaitingReply: false,
    byKind: {},
  }
  return { data: { items, engagement }, isLoading: false, isError: false }
}

function renderContactFil() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TimelinePanel
        scope="contact"
        entityId="c-1"
        contactId="c-1"
        showSync
        categories={['client', 'internal', 'actions', 'all']}
        defaultCategory="client"
      />
    </QueryClientProvider>,
  )
}

describe('TimelinePanel — le fil d’une personne (#3688)', () => {
  beforeEach(() => {
    timeline.mockReset()
    sync.mockReset()
    window.sessionStorage.clear()
  })

  it('#3688.7 — par défaut, seulement la relation client : ni interne, ni consultation du CRM', () => {
    timeline.mockReturnValue(
      ok([
        activity({ id: 'a', subject: 'Point client' }),
        activity({ id: 'b', kind: 'meeting', direction: 'internal', subject: 'Préparation interne' }),
        activity({ id: 'c', kind: 'crm_lookup', source: 'system', direction: 'internal', subject: null }),
      ]),
    )
    renderContactFil()
    expect(screen.getByText('Point client')).toBeInTheDocument()
    expect(screen.queryByText('Préparation interne')).not.toBeInTheDocument()
    expect(screen.queryByText(/a consulté ton CRM/i)).not.toBeInTheDocument()
    // Rien n'est perdu : « Interne » et « Tout » le disent.
    fireEvent.click(screen.getByRole('button', { name: 'Interne' }))
    expect(screen.getByText('Préparation interne')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tout' }))
    expect(screen.getByText(/a consulté ton CRM/i)).toBeInTheDocument()
  })

  it('#3688.7 — un e-mail consigné à la main se lit « Saisi à la main », jamais « livré » ni « lu »', () => {
    timeline.mockReturnValue(ok([activity({ kind: 'email', source: 'manual', direction: 'outbound' })]))
    renderContactFil()
    expect(screen.getByText('Saisi à la main')).toBeInTheDocument()
    expect(screen.queryByText(/livré|delivered|\blu\b|\bread\b/i)).not.toBeInTheDocument()
  })

  it('#3688.6/.7 — un rendez-vous futur est « À venir » et « Planifié », hors du passé', () => {
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    timeline.mockReturnValue(
      ok([
        activity({ id: 'p', kind: 'meeting', subject: 'Atelier de cadrage', occurredAt: future, source: 'agenda' }),
        activity({ id: 'q', subject: 'Échange passé' }),
      ]),
    )
    renderContactFil()
    const upcoming = screen.getByRole('region', { name: 'À venir' })
    expect(within(upcoming).getByText('Atelier de cadrage')).toBeInTheDocument()
    expect(within(upcoming).getByText('Planifié, pas encore tenu')).toBeInTheDocument()
    expect(within(upcoming).queryByText('Échange passé')).not.toBeInTheDocument()
  })

  it('#3688.7 — sans rendez-vous futur, aucune section « À venir » (une absence ne fait pas de ligne)', () => {
    timeline.mockReturnValue(ok([activity()]))
    renderContactFil()
    expect(screen.queryByRole('region', { name: 'À venir' })).not.toBeInTheDocument()
  })

  it('#3688.10 — la recherche filtre le fil, dit quand rien ne correspond, et se retrouve au retour', () => {
    timeline.mockReturnValue(
      ok([
        activity({ id: 'a', subject: 'Budget validé' }),
        activity({ id: 'b', subject: 'Relance profils', occurredAt: '2026-08-10T09:00:00.000Z' }),
      ]),
    )
    const first = renderContactFil()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans l’historique' }), {
      target: { value: 'budget' },
    })
    expect(screen.getByText('Budget validé')).toBeInTheDocument()
    expect(screen.queryByText('Relance profils')).not.toBeInTheDocument()
    first.unmount()

    renderContactFil()
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans l’historique' })).toHaveValue('budget')
    expect(screen.queryByText('Relance profils')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans l’historique' }), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText(/Aucun échange ne correspond/)).toBeInTheDocument()
  })

  it('#3688 — chargement progressif : 15 lignes, puis « Afficher plus »', () => {
    const many = Array.from({ length: 22 }, (_, i) =>
      activity({
        id: `m-${i}`,
        subject: `Échange numéro ${i}`,
        occurredAt: new Date(Date.UTC(2026, 7, 1 + i, 9)).toISOString(),
      }),
    )
    timeline.mockReturnValue(ok(many))
    renderContactFil()
    expect(screen.getAllByText(/^Échange numéro/)).toHaveLength(15)
    fireEvent.click(screen.getByRole('button', { name: /Afficher plus/ }))
    expect(screen.getAllByText(/^Échange numéro/)).toHaveLength(22)
    expect(screen.queryByRole('button', { name: /Afficher plus/ })).not.toBeInTheDocument()
  })

  it('#3688.11 — une source en panne est ANNONCÉE : historique partiel, jamais un fil présenté complet', () => {
    timeline.mockReturnValue(ok([activity()]))
    sync.mockImplementation((_vars: unknown, opts?: { onSuccess?: (result: unknown) => void }) => {
      opts?.onSuccess?.({
        sources: [
          { source: 'mailbox', ingested: 1, duplicates: 0, skipped: [], unavailable: null, reason: null },
          { source: 'agenda', ingested: 0, duplicates: 0, skipped: [], unavailable: 'Graph 503', reason: 'error' },
        ],
        ingested: 1,
      })
    })
    renderContactFil()
    expect(screen.queryByText(/Historique partiel/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Récupérer'))
    expect(screen.getByText(/Historique partiel/)).toHaveTextContent('ton agenda')
    // Les échanges déjà connus restent affichés : une source en erreur ne vide pas le fil.
    expect(screen.getByText('Deux profils conformité')).toBeInTheDocument()
  })
})
