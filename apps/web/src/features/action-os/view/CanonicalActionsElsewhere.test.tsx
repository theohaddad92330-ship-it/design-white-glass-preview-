import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CanonicalAction, ListCanonicalActionsResponse } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanonicalActionsElsewhere } from './CanonicalActionsElsewhere'

const WS = '00000000-0000-4000-8000-0000000000aa'

function action(overrides: Partial<CanonicalAction>): CanonicalAction {
  return {
    action_id: 'task:1',
    origin: { model: 'task', id: '1' },
    workspace_id: WS,
    object_type: null,
    object_id: null,
    object_label: null,
    account_id: null,
    account_name: null,
    contact_id: null,
    need_id: null,
    type: null,
    title: 'Envoyer la proposition',
    description: null,
    objective: null,
    expected_outcome: null,
    expected_outcome_note: null,
    owner: null,
    due_at: null,
    priority: null,
    status: 'accepted',
    native_status: 'todo',
    source: null,
    source_at: null,
    confidence: null,
    channel: null,
    cost_credits: null,
    dependencies: [],
    result: null,
    created_by: null,
    created_at: '2026-09-20T08:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

const fixture: { response: ListCanonicalActionsResponse } = { response: { actions: [], unavailable: [] } }

vi.mock('../api', () => ({
  actionOsApi: { actions: () => Promise.resolve(fixture.response) },
  actionOsKeys: { actions: ['action-os', 'actions'] },
}))

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CanonicalActionsElsewhere />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fixture.response = { actions: [], unavailable: [] }
})

describe('CanonicalActionsElsewhere — #2395 la page Actions porte la vue complète', () => {
  it('montre les actions des AUTRES maisons, avec objectif, résultat attendu, source et lien vers leur maison', async () => {
    fixture.response = {
      actions: [
        // Déjà listée juste au-dessus par « Mes relances » : jamais une deuxième fois.
        action({ action_id: 'plan_item:1', origin: { model: 'plan_item', id: '1' }, title: 'Rappeler le DSI' }),
        action({
          action_id: 'call_task:2',
          origin: { model: 'call_task', id: '2' },
          title: 'A ouvert la proposition',
          type: 'call',
          objective: 'Obtenir la date de décision sur le besoin IAM',
          expected_outcome: 'decision',
          source: 'laura',
        }),
        action({ title: 'Envoyer la proposition', source: 'user', expected_outcome_note: 'Un accord de principe' }),
      ],
      unavailable: [],
    }
    renderIt()
    expect(await screen.findByText('A ouvert la proposition')).toBeInTheDocument()
    expect(screen.queryByText('Rappeler le DSI')).not.toBeInTheDocument()
    expect(screen.getByText(/Obtenir la date de décision sur le besoin IAM/)).toBeInTheDocument()
    expect(screen.getByText(/Décision/)).toBeInTheDocument()
    expect(screen.getByText(/Recommandée par Laura/)).toBeInTheDocument()
    expect(screen.getByText(/Un accord de principe/)).toBeInTheDocument()
    expect(screen.getByText(/Créée par toi/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Séquences/ })).toHaveAttribute('href', '/actions/sequences')
    expect(screen.getByRole('link', { name: /Ma journée/ })).toHaveAttribute('href', '/briefing')
  })

  it('une absence ne fait aucune ligne : ni objectif ni source inventés', async () => {
    fixture.response = { actions: [action({})], unavailable: [] }
    renderIt()
    expect(await screen.findByText('Envoyer la proposition')).toBeInTheDocument()
    expect(screen.queryByText(/Objectif/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Résultat attendu/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Créée par|Recommandée|Déclenchée/)).not.toBeInTheDocument()
  })

  it('une maison illisible est nommée, jamais rendue comme « rien à faire »', async () => {
    fixture.response = { actions: [], unavailable: ['task'] }
    renderIt()
    expect(await screen.findByText(/Tes tâches n’ont pas pu être lues/)).toBeInTheDocument()
  })

  it('rien dans les autres maisons : aucune section', async () => {
    const { container } = renderIt()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it('#2395.10 — une intervention (routine) ne s’affiche jamais ici : sa maison est /briefing', async () => {
    // La file d'intervention du responsable est déjà rendue par
    // `DailyGesturesBlock` sur /briefing (#2387.9) — l'afficher AUSSI ici la
    // dupliquerait, ce que #2395.11 interdit. `HOME_OF` ne lui donne d'ailleurs
    // aucune maison : sans ce filtre, la ligne serait rendue avec un lien cassé.
    // Un `task` RÉEL sert d'ancre : sa présence prouve que le fetch a résolu
    // avant qu'on affirme l'absence de l'intervention (jamais un tick à l'aveugle).
    fixture.response = {
      actions: [
        action({
          action_id: 'intervention:1',
          origin: { model: 'intervention', id: '1' },
          title: 'Renouvellement à risque',
        }),
        action({ action_id: 'task:9', origin: { model: 'task', id: '9' }, title: 'Envoyer la proposition' }),
      ],
      unavailable: [],
    }
    renderIt()
    expect(await screen.findByText('Envoyer la proposition')).toBeInTheDocument()
    expect(screen.queryByText('Renouvellement à risque')).not.toBeInTheDocument()
  })
})
