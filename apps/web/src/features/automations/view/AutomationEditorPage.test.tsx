import type { AutomationRuleView, AutomationTrialView } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/page/CustomerPage', () => import('./customerPageDouble'))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: ({ label, question }: { label: string; question: string }) => (
    <button type="button" data-question={question}>
      {label}
    </button>
  ),
}))

const navigate = vi.fn()
const rulesQuery = vi.fn()
const saveDraft = vi.fn()
const runTrial = vi.fn()
const activate = vi.fn()
const switchPreviewQuery = vi.fn()
const duplicate = vi.fn()
const archive = vi.fn()
const toggle = vi.fn()
const remove = vi.fn()
vi.mock('../api', () => ({
  useAutomationRules: () => rulesQuery(),
  useSaveAutomationDraft: () => ({ mutate: saveDraft, isPending: false }),
  useAutomationTrial: () => ({ mutate: runTrial, isPending: false }),
  useAutomationSwitchPreview: (id: string, enabled: boolean) => switchPreviewQuery(id, enabled),
  useActivateAutomationDraft: () => ({ mutate: activate, isPending: false }),
  useDuplicateAutomationRule: () => ({ mutate: duplicate, isPending: false }),
  useArchiveAutomationRule: () => ({ mutate: archive, isPending: false }),
  useUpdateAutomationRule: () => ({ mutate: toggle, isPending: false }),
  useDeleteAutomationRule: () => ({ mutate: remove, isPending: false }),
}))

const { AutomationEditorPage } = await import('./AutomationEditorPage')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const rule = (over: Partial<AutomationRuleView> = {}): AutomationRuleView => ({
  id: 'r1',
  signal: 'mission_end',
  action_kind: 'prepare_action',
  playbook_key: null,
  prepared_action: 'call_to_make',
  inactive_days: null,
  enabled: true,
  credit_cap: null,
  credit_cost: 0,
  firings_30d: 4,
  skipped_30d: 0,
  credits_spent_30d: 0,
  last_run_at: '2026-10-21T06:20:00Z',
  template_key: null,
  created_at: '2026-10-01T00:00:00Z',
  name: 'Une fin de mission approche',
  version: 1,
  draft: null,
  ...over,
})

const draftOf = (tested: boolean): NonNullable<AutomationRuleView['draft']> => ({
  name: 'Fin de mission (e-mail)',
  signal: 'mission_end',
  action_kind: 'prepare_action',
  playbook_key: null,
  prepared_action: 'email_to_review',
  inactive_days: null,
  credit_cap: null,
  tested,
})

const mockRule = (value: AutomationRuleView) =>
  rulesQuery.mockReturnValue({ data: [value], isLoading: false, isError: false })
const user = () => userEvent.setup({ pointerEventsCheck: 0 })

beforeEach(() => {
  vi.clearAllMocks()
  // Par défaut la comparaison est rendue (la bascule s'ouvre) ; un test la met en chargement pour prouver le refus.
  switchPreviewQuery.mockReturnValue({
    data: {
      rule_id: 'r1',
      from_version: 1,
      to_version: 2,
      current: { signal: 'mission_end', action_kind: 'prepare_action' },
      next: { signal: 'mission_end', action_kind: 'prepare_action' },
      differences: [{ field: 'prepared_action', before: 'call_to_make', after: 'email_to_review' }],
      migration: { engaged_firings: 2, signal_changes: false },
      impact: { measured: true, situations_read: 2, would_act: 2 },
    },
    isLoading: false,
    isError: false,
  })
})

// Théo C automations-editeur — « Ajuster ton automatisation ».
describe('AutomationEditorPage', () => {
  it('R1/R2 — un seul écran : titre, chaîne en QUATRE maillons comme la maquette (Laura repère, Laura prépare), jamais Nora ni Hugo', () => {
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Ajuster ton automatisation' })).toBeInTheDocument()
    const chain = screen.getByRole('list', { name: 'Le parcours de la règle' })
    expect(within(chain).getAllByRole('listitem')).toHaveLength(4)
    expect(chain).toHaveTextContent('Laura repère ce qui compte')
    expect(chain).toHaveTextContent('Les missions de l’espace et leur date de fin.')
    expect(chain).toHaveTextContent('Laura prépare la suite')
    expect(chain).toHaveTextContent('Tu gardes la décision')
    expect(document.body.textContent).not.toMatch(/Nora|Hugo/)
  })

  it('chaque maillon est cliquable : il ouvre son état, avec « Régler » qui mène aux réglages', async () => {
    const u = user()
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)
    await u.click(screen.getByRole('button', { name: /Voir le détail : Laura repère ce qui compte/ }))
    const node = screen.getByRole('dialog')
    expect(within(node).getByText('Le repérage')).toBeInTheDocument()
    await u.click(within(node).getByRole('button', { name: 'Régler' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Régler cette automatisation')
  })

  it('« Enregistrer le brouillon » ouvre les réglages : la version suivante naît de ce geste', async () => {
    const u = user()
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)
    await u.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Régler cette automatisation')
  })

  it('« Supprimer » demande confirmation, puis supprime (l’archivage reste le geste par défaut)', async () => {
    const u = user()
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)
    await u.click(screen.getByRole('button', { name: 'Supprimer' }))
    const dialog = screen.getByRole('dialog')
    expect(remove).not.toHaveBeenCalled()
    await u.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    expect(remove).toHaveBeenCalledWith('r1', expect.anything())
  })

  it('Théo C automations-editeur — en-tête déclaré à la coque, puis Laura à gauche et le plan à droite, dans l’ordre', () => {
    mockRule(rule())
    const { container } = render(<AutomationEditorPage id="r1" />)
    const head = screen.getByTestId('page-head')
    expect(within(head).getByRole('heading', { level: 1, name: 'Ajuster ton automatisation' })).toBeInTheDocument()
    expect(within(head).getByRole('link', { name: 'Retour aux automatisations' })).toHaveAttribute(
      'href',
      '/actions/automatisations',
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const builder = container.querySelector('[data-section="builder"]')!
    const laura = builder.querySelector('[data-section="laura"]')!
    const plan = builder.querySelector('[data-section="plan"]')!
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(laura, plan)).toBe(true)
    const scenario = within(plan as HTMLElement).getByRole('region', { name: 'Ton scénario' })
    const chain = within(scenario).getByRole('list', { name: 'Le parcours de la règle' })
    const stops = within(scenario).getByText(/Ce qui arrête le suivi/)
    const trialCard = within(plan as HTMLElement).getByRole('region', { name: 'Essayer avant de conserver' })
    expect(within(chain).getAllByRole('button')).toHaveLength(4)
    expect(follows(chain, stops)).toBe(true)
    expect(follows(scenario, trialCard)).toBe(true)
    expect(within(trialCard).getByRole('button', { name: 'Enregistrer le brouillon' })).toBeInTheDocument()
  })

  it('le guide métier est replié sur l’écran', () => {
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByText('Ce qu’est une automatisation, et le parcours utile')).toBeInTheDocument()
    expect(screen.getByText(/Une automatisation naît éteinte/)).toBeInTheDocument()
  })

  it('le nom de la règle titre le scénario ; sans nom, c’est sa phrase qui le titre', () => {
    mockRule(rule({ name: null }))
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByRole('heading', { level: 2, name: 'une mission arrive à son terme' })).toBeInTheDocument()
  })

  it('A4 — l’origine « Règle » et le lien vers ce qu’elle a préparé (À traiter)', () => {
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByText('Règle')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ce qu’elle a préparé · 4 actions sur 30 jours' })).toHaveAttribute(
      'href',
      '/actions',
    )
  })

  it('une règle qui n’a jamais tourné dit « pas encore mesuré », jamais 0 action', () => {
    mockRule(rule({ firings_30d: null }))
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByRole('link', { name: 'Ce qu’elle a préparé · pas encore mesuré' })).toBeInTheDocument()
    expect(screen.queryByText(/0 action/)).not.toBeInTheDocument()
  })

  it('A1 — le coût se dit SANS chiffre (#4468) : « Incluse dans ton offre » / « Compte dans ton usage »', () => {
    mockRule(rule({ credit_cost: 0 }))
    const { unmount } = render(<AutomationEditorPage id="r1" />)
    expect(screen.getByText('Incluse dans ton offre')).toBeInTheDocument()
    unmount()

    mockRule(rule({ credit_cost: 3 }))
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByText('Compte dans ton usage')).toBeInTheDocument()
    expect(screen.queryByText(/\b3\b.*crédit/)).not.toBeInTheDocument()
  })

  it('N2/N3 — avec un brouillon : pastille « Version 2 · brouillon », la version 1 continue de tourner', () => {
    mockRule(rule({ draft: draftOf(false) }))
    render(<AutomationEditorPage id="r1" />)

    expect(screen.getByText('Version 2 · brouillon')).toBeInTheDocument()
    // L’éditeur ouvre ce qu’il édite : le brouillon.
    expect(screen.getByRole('heading', { level: 2, name: 'Fin de mission (e-mail)' })).toBeInTheDocument()
  })

  it('sans brouillon : « Version 1 » et aucun bouton d’activation', () => {
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByText('Version 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Activer la version/ })).not.toBeInTheDocument()
  })

  it('« Activer la version 2 » est refusé tant que le brouillon n’a pas été testé, et dit pourquoi', () => {
    mockRule(rule({ draft: draftOf(false) }))
    render(<AutomationEditorPage id="r1" />)

    expect(screen.getByRole('button', { name: 'Activer la version 2' })).toBeDisabled()
    expect(screen.getByText(/Teste le parcours pour pouvoir activer/)).toBeInTheDocument()
  })

  it('#2399.7 — un brouillon testé montre la comparaison AVANT de basculer, là où la bascule se fait', () => {
    mockRule(rule({ draft: draftOf(true) }))
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByText('Avant de basculer')).toBeInTheDocument()
    expect(screen.getByText('Version 1 · celle qui tourne')).toBeInTheDocument()
    expect(screen.getByText('Version 2 · la suivante')).toBeInTheDocument()
  })

  it('NON : tant que la comparaison n’est pas rendue, « Activer la version 2 » reste fermé', async () => {
    const u = user()
    switchPreviewQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    mockRule(rule({ draft: draftOf(true) }))
    render(<AutomationEditorPage id="r1" />)
    const button = screen.getByRole('button', { name: 'Activer la version 2' })
    expect(button).toBeDisabled()
    await u.click(button)
    expect(activate).not.toHaveBeenCalled()
  })

  it('un brouillon testé s’active : c’est ce geste qui écrit', async () => {
    const u = user()
    mockRule(rule({ draft: draftOf(true) }))
    render(<AutomationEditorPage id="r1" />)

    await u.click(screen.getByRole('button', { name: 'Activer la version 2' }))

    expect(activate).toHaveBeenCalledWith('r1', expect.anything())
  })

  it('R5 — « Tester le parcours » lance l’essai ; le résultat dit ce qui a été lu, rien n’est créé', async () => {
    const u = user()
    mockRule(rule())
    const result: AutomationTrialView = {
      id: 't1',
      rule_id: 'r1',
      rule_name: 'Une fin de mission approche',
      signal: 'mission_end',
      target: 'live',
      outcome: 'ok',
      situations_read: 2,
      situation_labels: ['EDF', 'Thales'],
      would_act: 2,
      reason: null,
      created_at: '2026-10-22T08:00:00Z',
    }
    runTrial.mockImplementation((_id: string, options: { onSuccess: (r: AutomationTrialView) => void }) =>
      options.onSuccess(result),
    )
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByText(/Il ne crée ni tâche, ni message/)).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Tester le parcours' }))

    expect(runTrial).toHaveBeenCalledWith('r1', expect.anything())
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('2 situations lues')
    expect(
      within(status)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual(['EDF', 'Thales'])
    expect(status).toHaveTextContent('Aurait préparé 2 actions à valider')
    expect(status).toHaveTextContent('Aucune écriture pendant ce test')
  })

  it('un essai impossible se NOMME (la source illisible), il ne dit pas « rien à faire »', async () => {
    const u = user()
    mockRule(rule())
    runTrial.mockImplementation((_id: string, options: { onSuccess: (r: AutomationTrialView) => void }) =>
      options.onSuccess({
        id: 't2',
        rule_id: 'r1',
        rule_name: 'x',
        signal: 'mission_end',
        target: 'live',
        outcome: 'failed',
        situations_read: null,
        situation_labels: [],
        would_act: null,
        reason: 'La source de cette règle n’a pas pu être lue.',
        created_at: '2026-10-22T08:00:00Z',
      }),
    )
    render(<AutomationEditorPage id="r1" />)

    await u.click(screen.getByRole('button', { name: 'Tester le parcours' }))

    expect(screen.getByRole('status')).toHaveTextContent('Impossible : La source de cette règle n’a pas pu être lue.')
  })

  it('une règle en pause le promet : aucun nouveau passage pendant une pause', () => {
    mockRule(rule({ enabled: false }))
    render(<AutomationEditorPage id="r1" />)
    expect(screen.getByText(/Aucun nouveau passage pendant une pause/)).toBeInTheDocument()
  })

  it('« Régler » : trois groupes Quand / Quoi / Combien, les six déclencheurs, et « Appliquer au brouillon » enregistre un BROUILLON', async () => {
    const u = user()
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)

    await u.click(screen.getByRole('button', { name: 'Régler' }))
    const dialog = screen.getByRole('dialog')
    for (const group of ['Quand', 'Quoi', 'Combien']) {
      expect(within(dialog).getByText(group)).toBeInTheDocument()
    }
    expect(within(dialog).getByText(/Jamais seul : chaque envoi passe par ta validation/)).toBeInTheDocument()

    // A2 — les six déclencheurs, pas le seul exemple de la maquette.
    await u.click(within(dialog).getByRole('combobox', { name: 'Déclencheur' }))
    expect((await screen.findAllByRole('option')).length).toBe(6)
    await u.keyboard('{Escape}')

    await u.clear(within(dialog).getByLabelText('Nom de l’automatisation'))
    await u.type(within(dialog).getByLabelText('Nom de l’automatisation'), 'Fin de mission à 45 jours')
    await u.type(within(dialog).getByLabelText('Plafond d’usage sur 30 jours'), '30')
    await u.click(within(dialog).getByRole('button', { name: 'Appliquer au brouillon' }))

    expect(saveDraft).toHaveBeenCalledTimes(1)
    const [args] = saveDraft.mock.calls[0] as [{ id: string; draft: Record<string, unknown> }]
    expect(args.id).toBe('r1')
    expect(args.draft).toMatchObject({
      name: 'Fin de mission à 45 jours',
      signal: 'mission_end',
      action_kind: 'prepare_action',
      prepared_action: 'call_to_make',
      credit_cap: 30,
    })
  })

  it('« Dupliquer » crée une copie éteinte et ouvre la copie', async () => {
    const u = user()
    mockRule(rule())
    duplicate.mockImplementation((_id: string, options: { onSuccess: (copy: { id: string }) => void }) =>
      options.onSuccess({ id: 'copy' }),
    )
    render(<AutomationEditorPage id="r1" />)

    await u.click(screen.getByRole('button', { name: 'Dupliquer' }))

    expect(duplicate).toHaveBeenCalledWith('r1', expect.anything())
    expect(navigate).toHaveBeenCalledWith({ to: '/actions/automatisations/$id', params: { id: 'copy' } })
  })

  it('R3 — « Archiver cette règle » demande confirmation, dit ce qui est conservé, n’écrit qu’au geste', async () => {
    const u = user()
    mockRule(rule())
    archive.mockImplementation((_id: string, options: { onSuccess: () => void }) => options.onSuccess())
    render(<AutomationEditorPage id="r1" />)

    await u.click(screen.getByRole('button', { name: 'Archiver cette règle' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Les tâches, brouillons et preuves déjà créés sont conservés')
    expect(archive).not.toHaveBeenCalled()

    await u.click(within(dialog).getByRole('button', { name: 'Archiver' }))
    expect(archive).toHaveBeenCalledWith('r1', expect.anything())
    expect(navigate).toHaveBeenCalledWith({ to: '/actions/automatisations' })
  })

  it('N5 — « Outils requis » est replié ; une fin de mission se lit dans l’ATS du client', () => {
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)

    const summary = screen.getByText('Outils requis et capacité du modèle de départ')
    const details = summary.closest('details') as HTMLElement
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText('Ton ATS')).toBeInTheDocument()
    expect(within(details).getByRole('link', { name: 'Voir mes connexions' })).toHaveAttribute('href', '/integrations')
  })

  it('N1 — « Préciser » reste inerte tant que rien n’est écrit ; écrit, il passe la précision à Laura avec la règle', async () => {
    const u = user()
    mockRule(rule())
    render(<AutomationEditorPage id="r1" />)

    expect(screen.getByRole('button', { name: 'Préciser' })).toBeDisabled()
    await u.type(screen.getByRole('textbox', { name: 'Précise la règle à Laura' }), 'Plutôt 45 jours pour EDF')

    const refine = screen.getByRole('button', { name: 'Préciser' })
    expect(refine).toBeEnabled()
    expect(refine.getAttribute('data-question')).toContain('Une fin de mission approche')
    expect(refine.getAttribute('data-question')).toContain('Plutôt 45 jours pour EDF')
    expect(screen.getByText('Les modifications ne déclenchent rien.')).toBeInTheDocument()
  })

  it('l’interrupteur allume / éteint la règle (une règle naît éteinte, un geste humain l’allume)', async () => {
    const u = user()
    mockRule(rule({ enabled: false }))
    render(<AutomationEditorPage id="r1" />)

    await u.click(screen.getByRole('switch', { name: 'La règle tourne' }))

    expect(toggle).toHaveBeenCalledWith({ id: 'r1', patch: { enabled: true } }, expect.anything())
  })

  it('une règle introuvable (archivée, ou à un autre) le dit — jamais un éditeur vide', () => {
    rulesQuery.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<AutomationEditorPage id="zzz" />)
    expect(screen.getByText('Automatisation introuvable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour aux automatisations' })).toHaveAttribute(
      'href',
      '/actions/automatisations',
    )
  })
})
