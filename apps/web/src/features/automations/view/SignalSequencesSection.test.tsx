import type { AutomationRuleView, RoutineView, WorkflowDefinition } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lot L-D1 (#4167) — UNE liste, UNE grammaire, des compteurs honnêtes. #4357.1 (19/10) : l'écran
 * « Actions › Automatisations » devient la section « sur signal » de l'écran Séquences.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => {
    const href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
    return <a href={href}>{children}</a>
  },
}))
vi.mock('@/features/routines/view/RoutineControls', () => ({
  RoutineStatusControl: ({ view }: { view: RoutineView }) => <span>statut routine {view.subscription.status}</span>,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const rules = vi.fn()
const routines = vi.fn()
const workflows = vi.fn()
const updateMutate = vi.fn()
const activateMutate = vi.fn()
const createMutate = vi.fn()
const removeMutate = vi.fn()
vi.mock('../api', () => ({
  useAutomationRules: () => rules(),
  useUpdateAutomationRule: () => ({ mutate: updateMutate, isPending: false }),
  useActivateAutomationTemplate: () => ({ mutate: activateMutate, isPending: false }),
  useCreateAutomationRule: () => ({ mutate: createMutate, isPending: false }),
  useDeleteAutomationRule: () => ({ mutate: removeMutate, isPending: false }),
}))
vi.mock('@/features/routines/api', () => ({ useRoutines: () => routines() }))
vi.mock('@/features/action-os/api', () => ({
  actionOsApi: { workflows: () => workflows() },
  actionOsKeys: { workflows: ['action-os', 'workflows'] },
}))

const { SignalSequencesSection } = await import('./SignalSequencesSection')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const rule = (over: Partial<AutomationRuleView> = {}): AutomationRuleView => ({
  id: 'r1',
  signal: 'tender',
  action_kind: 'enroll_sequence',
  playbook_key: 'tender',
  prepared_action: null,
  inactive_days: null,
  enabled: true,
  credit_cap: null,
  credit_cost: 0,
  firings_30d: 3,
  skipped_30d: 1,
  credits_spent_30d: 0,
  last_run_at: '2026-10-14T06:20:00.000Z',
  template_key: null,
  created_at: '2026-10-01T00:00:00.000Z',
  ...over,
})

const routine: RoutineView = {
  definition: {
    key: 'daily_briefing',
    name: { fr: 'Brief du matin', en: 'Morning briefing' },
    condition: { fr: 'Au moins une action est proposable ce matin.', en: 'At least one action.' },
    outcome: { fr: 'Une notification qui ouvre sur « Aujourd’hui ».', en: 'A notification.' },
  },
  subscription: { key: 'daily_briefing', status: 'active', enabled: true },
  blockers: [],
} as unknown as RoutineView

const workflow = {
  key: 'signal_to_account_opening',
  name: { fr: 'Signal récent → ouverture de compte', en: 'Fresh signal → account opening' },
  trigger: 'signal_detected',
  enabled: true,
} as unknown as WorkflowDefinition

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SignalSequencesSection />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  updateMutate.mockClear()
  activateMutate.mockClear()
  rules.mockReturnValue({ data: [rule()], isLoading: false, isError: false })
  routines.mockReturnValue({ data: [routine] })
  workflows.mockResolvedValue({ workflows: [workflow] })
})

describe('SignalSequencesSection — les séquences sur signal, dans l’écran Séquences (#4357.1)', () => {
  it('dit chaque règle dans UNE grammaire : « Quand … alors … », avec le nom de la séquence', () => {
    renderPage()
    expect(
      screen.getByText(/Quand un appel d’offres est publié, inscrire le contact dans la séquence « Appel d’offres »/),
    ).toBeInTheDocument()
  })

  it('fusionne règles, routines planifiées et workflows dans la même liste, chacun nommé par son origine', async () => {
    renderPage()
    expect(screen.getByText(/Au moins une action est proposable ce matin\. Une notification/)).toBeInTheDocument()
    expect(screen.getAllByText('Planifiée').length).toBeGreaterThan(0)
    expect(screen.getByText('statut routine active')).toBeInTheDocument()
    expect(await screen.findByText('Signal récent → ouverture de compte')).toBeInTheDocument()
    expect(screen.getAllByText('Workflow').length).toBeGreaterThan(0)
  })

  it('le compteur des 30 jours est celui du journal ; « non mesuré » quand la règle n’a jamais tourné — jamais 0', () => {
    rules.mockReturnValue({
      data: [
        rule({ id: 'a', firings_30d: 3, skipped_30d: 1 }),
        rule({
          id: 'b',
          signal: 'hiring',
          playbook_key: 'hiring_signal',
          firings_30d: null,
          skipped_30d: null,
          last_run_at: null,
        }),
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText(/3 déclenchements sur 30 jours · 1 écarté/)).toBeInTheDocument()
    expect(screen.getAllByText('Non mesuré').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^0 déclenchement/)).not.toBeInTheDocument()
  })

  it('un 0 MESURÉ reste affiché 0 (la règle a tourné sans rien déclencher)', () => {
    rules.mockReturnValue({ data: [rule({ firings_30d: 0, skipped_30d: 0 })], isLoading: false, isError: false })
    renderPage()
    expect(screen.getByText(/0 déclenchement sur 30 jours/)).toBeInTheDocument()
  })

  it('#4463 — aucun coût ni plafond de crédits à l’écran : le contrôle n’existe plus', () => {
    renderPage()
    expect(screen.queryByLabelText(/Plafond de crédits/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('Incluse dans ton offre').length).toBeGreaterThan(0)
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(updateMutate).not.toHaveBeenCalled()
  })

  it('allume / éteint une règle d’un geste', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('switch', { name: /Activer la règle « Un appel d’offres est publié »/ }))
    expect(updateMutate).toHaveBeenCalledWith({ id: 'r1', patch: { enabled: false } }, expect.anything())
  })

  it('un compte inactif dit son délai dans la phrase', () => {
    rules.mockReturnValue({
      data: [rule({ signal: 'inactive_account', playbook_key: 'win_back', inactive_days: 45 })],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText(/Quand un compte reste sans action depuis 45 jours/)).toBeInTheDocument()
  })

  it('une règle « préparer » se lit : alors préparer un e-mail à relire', () => {
    rules.mockReturnValue({
      data: [rule({ action_kind: 'prepare_action', playbook_key: null, prepared_action: 'email_to_review' })],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText(/préparer un e-mail à relire/)).toBeInTheDocument()
  })

  it('sans rien (ni règle, ni routine, ni workflow), un état vide dit quoi faire — pas de ligne inventée', () => {
    rules.mockReturnValue({ data: [], isLoading: false, isError: false })
    routines.mockReturnValue({ data: [] })
    workflows.mockResolvedValue({ workflows: [] })
    renderPage()
    expect(screen.getByText('Aucune automatisation pour l’instant')).toBeInTheDocument()
    expect(screen.getByText(/pars d’une routine de la bibliothèque/)).toBeInTheDocument()
  })

  it('nomme une lecture en échec au lieu de présenter une liste vide comme complète', () => {
    rules.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de lire tes règles')
  })

  it('chaque carte dit sa chaîne, ses mesures et son coût sans chiffre de crédit', () => {
    rules.mockReturnValue({ data: [rule({ credit_cost: 2, credit_cap: 40 })], isLoading: false, isError: false })
    renderPage()
    expect(screen.getAllByText('Déclencheur').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Préparation').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ta décision').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mesures').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Compte dans ton usage').length).toBeGreaterThan(0)
    expect(screen.queryByText(/plafond/i)).not.toBeInTheDocument()
  })

  it('Théo C automations-liste — la carte suit l’ordre de la maquette : pastilles, titre, phrase, chaîne, Mesures/Coût, pied', () => {
    rules.mockReturnValue({ data: [rule({ enabled: true })], isLoading: false, isError: false })
    const { container } = renderPage()
    const card = container.querySelector('[data-automation-card]')!
    expect(card).not.toBeNull()
    const text = card.textContent ?? ''
    const order = [
      'Règle',
      'Active',
      'Déclencheur',
      'Préparation',
      'Ta décision',
      'Mesures',
      'Coût',
      'Mes dossiers autorisés',
      'Ouvrir',
    ]
    const positions = order.map(label => text.indexOf(label))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(card.querySelector('h3')).not.toBeNull()
    const filters = container.querySelector('[data-section="filters"]')!
    const cards = container.querySelector('[data-section="cards"]')!
    expect(Boolean(filters.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('une règle éteinte qui n’a jamais passé naît « Éteinte » ; passée puis éteinte, elle est « En pause »', () => {
    rules.mockReturnValue({
      data: [
        rule({ id: 'a', enabled: false, last_run_at: null, firings_30d: null, skipped_30d: null }),
        rule({ id: 'b', signal: 'hiring', playbook_key: 'hiring_signal', enabled: false }),
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getAllByText('Éteinte').length).toBeGreaterThan(0)
    expect(screen.getAllByText('En pause').length).toBeGreaterThan(0)
    expect(screen.getByText('Pas encore de passage : elle naît éteinte')).toBeInTheDocument()
  })

  it('le filtre d’origine est à choix multiple : deux origines cochées montrent leur union', async () => {
    renderPage()
    await screen.findByText('Signal récent → ouverture de compte')
    await userEvent.click(screen.getByRole('button', { name: /^Règle/ }))
    expect(screen.queryByText('Signal récent → ouverture de compte')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Workflow/ }))
    expect(screen.getByText('Signal récent → ouverture de compte')).toBeInTheDocument()
    expect(screen.queryByText(/Au moins une action est proposable/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Toutes/ }))
    expect(screen.getByText(/Au moins une action est proposable/)).toBeInTheDocument()
  })

  it('« Ouvrir » mène à l’éditeur de la règle', () => {
    renderPage()
    const hrefs = screen.getAllByRole('link', { name: /Ouvrir/ }).map(link => link.getAttribute('href'))
    expect(hrefs).toContain('/actions/automatisations/r1')
  })
})
