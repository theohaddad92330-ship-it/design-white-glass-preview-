import type { BriefingAction, Task } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2105.24/.53 — « Transformer ce sujet en prochaine action », et la garde de
 * dédup qui l'accompagne.
 *
 * `ActionsBlock.test.tsx` mocke `@/features/tasks/hooks/useTasks` pour garder
 * ses tests sur le dépli, indépendants du réseau (voir sa note) : CE fichier
 * teste le geste réel, avec les MÊMES hooks que `TaskList` utilise, contrôlés
 * ici pour vérifier le rapprochement, jamais l'API.
 */

vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

vi.mock('../api', () => ({
  useSetRoleFit: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCardDisposition: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [] }),
}))

const tasksData = vi.fn<() => Task[]>()
const createMutate = vi.fn()

vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useTasks: () => ({ data: tasksData() }),
  useCreateTask: () => ({ mutate: createMutate, isPending: false }),
}))

// #3265.13 (épopée #3287) — même exigence de session que `useTasks`
// juste au-dessus : `PriorityCard` lit désormais `usePlanItems`.
vi.mock('@/features/actions/hooks/usePlanItems', () => ({
  usePlanItems: () => ({ items: [] }),
}))

// #3749.2 — même exigence de session que `useTasks` : `ActionsBlock` lit
// désormais `useQualificationSummary` pour fusionner le verdict de la
// grille dans chaque carte de compte.
vi.mock('@/features/accounts/view/accounts-list/useQualificationSummary', () => ({
  useQualificationSummary: () => ({ data: [] }),
}))

const { ActionsBlock } = await import('./ActionsBlock')

function action(partial: Partial<BriefingAction> & Pick<BriefingAction, 'id'>): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
    href: '/mailbox?intent=no_reply&thread=t1',
    kind: 'follow_up',
    priority: 4,
    fact: null,
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: { kind: 'account', id: 'acc-1', name: 'ACME', logoUrl: null, website: null },
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    ...partial,
  }
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    details: null,
    status: 'todo',
    priority: 'normal',
    dueOn: '2026-08-20',
    source: 'manual',
    type: 'personal',
    relatedActionRunId: null,
    sourceLabelKey: null,
    ownerId: null,
    ownerName: null,
    createdById: null,
    createdByName: null,
    expectedResult: null,
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    projectId: null,
    projectLabel: null,
    completedAt: null,
    completedById: null,
    completedByName: null,
    resultNote: null,
    channel: null,
    objective: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...partial,
  }
}

describe('ActionsBlock — transformer une carte en tâche (#2105.24)', () => {
  it('un clic ouvre le composeur avec l’objet déjà écrit, puis crée la tâche RATTACHÉE au compte de la carte', () => {
    tasksData.mockReturnValue([])
    render(<ActionsBlock actions={[action({ id: 'a1' })]} everySourceReady />)

    fireEvent.click(screen.getByRole('button', { name: /transformer/i }))
    // Le titre du composeur reprend le libellé affiché sur la carte.
    expect(screen.getByLabelText('Intitulé')).not.toHaveValue('')
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Obtenir une décision' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'Décision obtenue' } })

    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1' }), expect.anything())
  })
})

// Le libellé RENDU de `follow_up` sans `fact` (`briefing.json`, FR) — celui
// que la carte affiche et que le composeur doit reprendre verbatim.
const HEADLINE = "jean@acme.com n'a pas répondu depuis 9 jours sur « Proposition »"

describe('ActionsBlock — la garde de dédup (#2105.53)', () => {
  it('une tâche OUVERTE, même intitulé, même compte : la carte se dit déjà transformée', () => {
    tasksData.mockReturnValue([task({ id: 't1', title: HEADLINE, accountId: 'acc-1' })])
    render(<ActionsBlock actions={[action({ id: 'a1' })]} everySourceReady />)

    expect(screen.queryByRole('button', { name: /transformer/i })).not.toBeInTheDocument()
    expect(screen.getByText('Déjà transformée en tâche')).toBeInTheDocument()
  })

  it('une tâche FAITE ne bloque pas une nouvelle transformation', () => {
    tasksData.mockReturnValue([task({ id: 't1', title: HEADLINE, accountId: 'acc-1', status: 'done' })])
    render(<ActionsBlock actions={[action({ id: 'a1' })]} everySourceReady />)

    expect(screen.getByRole('button', { name: /transformer/i })).toBeInTheDocument()
  })

  it('une tâche ouverte sur un AUTRE compte ne masque pas le geste', () => {
    tasksData.mockReturnValue([task({ id: 't1', title: HEADLINE, accountId: 'acc-2' })])
    render(<ActionsBlock actions={[action({ id: 'a1' })]} everySourceReady />)

    expect(screen.getByRole('button', { name: /transformer/i })).toBeInTheDocument()
  })
})
