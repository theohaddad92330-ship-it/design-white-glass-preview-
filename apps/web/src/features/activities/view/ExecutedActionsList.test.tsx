import type { Activity } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExecutedActionsList } from './ExecutedActionsList'

const timeline = vi.fn()

vi.mock('../hooks/useTimeline', () => ({
  useTimeline: () => timeline(),
}))

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    kind: 'email',
    source: 'mailbox',
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
    linkReason: 'contact_email',
    userId: null,
    authorName: null,
    participants: [],
    externalId: 'msg-1',
    externalUrl: null,
    createdAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  }
}

function ok(items: Activity[]) {
  return {
    data: {
      items,
      engagement: {
        total: items.length,
        lastOutboundAt: null,
        lastInboundAt: null,
        daysSinceLastActivity: null,
        awaitingReply: false,
        byKind: {},
      },
    },
    isLoading: false,
    isError: false,
  }
}

function renderList(props: { omitRunEvents?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ExecutedActionsList scope="account" entityId="acc-1" {...props} />
    </QueryClientProvider>,
  )
}

/**
 * #2124.41 — RECETTE 15/09 prod 41805f310 (THALES) : « Actions et décisions »
 * ne montrait que `TaskList` (les tâches OUVERTES) — aucune action déjà
 * exécutée n'apparaissait. UNE SEULE SOURCE : les mêmes lignes que la
 * catégorie « Actions » de la timeline (`matchesCategory`), pas une copie
 * locale qui finirait par diverger.
 */
describe('ExecutedActionsList', () => {
  beforeEach(() => {
    timeline.mockReset()
  })

  it('affiche une action déjà exécutée (gate_decision, stage_change, task système…)', () => {
    timeline.mockReturnValue(ok([activity({ id: 'a-workflow', kind: 'workflow', source: 'system', subject: null })]))
    renderList()
    expect(screen.getByText('Exécution')).toBeInTheDocument()
  })

  it('ne montre PAS un échange — une interaction n’est pas une action exécutée', () => {
    timeline.mockReturnValue(ok([activity({ id: 'a-mail', kind: 'email', subject: 'Deux profils conformité' })]))
    renderList()
    expect(screen.queryByText('Deux profils conformité')).not.toBeInTheDocument()
  })

  it('#3505 — une consultation du CRM n’est pas une action exécutée : elle se lit UNE fois, dans la chronologie', () => {
    // Recette prod 01/10 : « Laura a consulté ton CRM » ×11 dans « Actions
    // exécutées », puis les mêmes lignes dans la chronologie — même table.
    timeline.mockReturnValue(
      ok([
        activity({ id: 'a-lookup-1', kind: 'crm_lookup', source: 'system', subject: null }),
        activity({ id: 'a-lookup-2', kind: 'crm_lookup', source: 'system', subject: null }),
        activity({ id: 'a-workflow', kind: 'workflow', source: 'system', subject: null }),
      ]),
    )
    renderList()
    expect(screen.queryByText(/a consulté ton CRM/)).not.toBeInTheDocument()
    expect(screen.getByText('Exécution')).toBeInTheDocument()
  })

  it('ne montre PAS une note — elle n’est ni un échange ni une action', () => {
    timeline.mockReturnValue(ok([activity({ id: 'a-note', kind: 'note', subject: 'Note interne' })]))
    renderList()
    expect(screen.queryByText('Note interne')).not.toBeInTheDocument()
  })

  it('dit qu’aucune action n’a encore été exécutée, plutôt qu’un vide muet', () => {
    timeline.mockReturnValue(ok([]))
    renderList()
    expect(screen.getByText("Aucune action exécutée pour l'instant.")).toBeInTheDocument()
  })
})

/**
 * #3532 (X76, recette prod 03/10) — « un événement ne s'affiche qu'une fois ».
 * `CopilotCardService.recordInTimeline` écrit UNE activité `workflow` dont
 * l'`externalId` est `workflow:<runId>` ; la chronologie unifiée juste dessous
 * (`AccountTimelineCard`) porte déjà ce MÊME run, avec son compteur d'étapes.
 */
describe('ExecutedActionsList — #3532 pas de doublon avec le fil des exécutions', () => {
  const run = activity({
    id: 'act-run',
    kind: 'workflow',
    source: 'system',
    direction: 'internal',
    subject: 'Préparer un message',
    externalId: 'workflow:run-1',
  })
  const manual = activity({
    id: 'act-manual',
    kind: 'workflow',
    source: 'system',
    direction: 'internal',
    subject: 'Relance planifiée',
    externalId: null,
  })

  beforeEach(() => timeline.mockReset())

  it('omitRunEvents retire l’activité née d’un run — le fil la porte déjà', () => {
    timeline.mockReturnValue(ok([run, manual]))
    renderList({ omitRunEvents: true })
    expect(screen.queryByText('Préparer un message')).toBeNull()
    expect(screen.getByText('Relance planifiée')).toBeInTheDocument()
  })

  it('sans omitRunEvents, la liste reste inchangée (la garde sait dire NON)', () => {
    timeline.mockReturnValue(ok([run, manual]))
    renderList()
    expect(screen.getByText('Préparer un message')).toBeInTheDocument()
  })
})
