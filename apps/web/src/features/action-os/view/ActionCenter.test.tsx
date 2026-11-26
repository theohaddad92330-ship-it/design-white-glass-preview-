import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, vi } from 'vitest'
import { toast } from 'sonner'
import { ActionCenter } from './ActionCenter'
import type { QueueFilterValues } from '../queueFilters'

/**
 * Le Centre d'actions (addendum final p23).
 *
 * Ce qui se teste ici, ce n'est pas la mise en page : c'est l'honnêteté de
 * l'écran. Une approbation doit montrer le résumé FIGÉ à la demande (pas un
 * recalcul), un run doit afficher le coût annoncé À CÔTÉ du coût réel (sans
 * quoi le devis n'est jamais vérifiable), et un onglet vide doit dire pourquoi
 * il l'est plutôt que de rester blanc.
 */

const decide = vi.fn()

vi.mock('../api', () => ({
  actionOsApi: {
    workflows: () =>
      Promise.resolve({
        workflows: [
          {
            key: 'crm_hygiene',
            name: { fr: 'Hygiène CRM', en: 'CRM hygiene' },
            description: { fr: 'Remonte la fiche puis écrit la note.', en: 'Upsert then note.' },
            steps: [
              {
                key: 'upsert_record',
                intentType: 'create_crm_task',
                intent: 'Remonter la fiche dans le CRM',
                capability: 'crm',
                permission: 'contacts:write',
                estimatedCredits: 0,
                risk: 'low',
                expectedResult: 'La fiche existe dans le CRM avec ses champs à jour.',
                dependsOn: [],
                retry: { maxAttempts: 1, backoffSeconds: 0 },
              },
              {
                key: 'append_note',
                intentType: 'create_crm_note',
                intent: 'Ajouter la note d’activité',
                capability: 'crm',
                permission: 'notes:write',
                estimatedCredits: 0,
                risk: 'low',
                expectedResult: 'Une note d’activité datée est visible sur la fiche.',
                dependsOn: [],
                retry: { maxAttempts: 1, backoffSeconds: 0 },
              },
            ],
          },
        ],
      }),
    runs: () =>
      Promise.resolve({
        runs: [
          {
            id: 'run-1',
            definition_key: 'crm_hygiene',
            definition_version: 1,
            trigger: 'manual',
            status: 'partial',
            account_id: null,
            contact_id: null,
            correlation_id: 'c1',
            steps: [
              {
                key: 'upsert_record',
                intentType: 'create_crm_task',
                outcome: 'done',
                attempts: 1,
                externalRef: 'hs-1',
                creditsSpent: 0,
                reason: null,
                startedAt: null,
                finishedAt: null,
              },
              {
                key: 'append_note',
                intentType: 'create_crm_note',
                outcome: 'failed',
                attempts: 1,
                externalRef: null,
                creditsSpent: 0,
                reason: 'CRM indisponible',
                startedAt: null,
                finishedAt: null,
              },
            ],
            estimated_credits: 2,
            spent_credits: 1,
            started_at: null,
            finished_at: null,
            created_at: '2026-08-01T10:00:00.000Z',
            ...fixtures.runOverride,
          },
          ...fixtures.extraRuns,
        ],
      }),
    approvals: () => Promise.resolve({ approvals: fixtures.approvals }),
    // #2395 — la section « Mes autres actions » de l'onglet Mes relances.
    actions: () => Promise.resolve({ actions: [], unavailable: [] }),
    // #1959.18 — le lancement d'une motion. Ce que ce mock RETIENT, c'est la
    // clé d'idempotence envoyée : c'est elle, et rien d'autre, qui décide s'il
    // y aura un run ou deux.
    start: (...args: unknown[]) => fixtures.start(...args),
    decide: (...args: unknown[]) => {
      decide(...args)
      return Promise.resolve({ run: {} })
    },
    // #2864 / #2856 — confier et reporter une demande.
    assign: (...args: unknown[]) => {
      fixtures.assign(...args)
      return Promise.resolve({ approval: {} })
    },
    snooze: (...args: unknown[]) => {
      fixtures.snooze(...args)
      return Promise.resolve({ approval: {} })
    },
  },
  actionOsKeys: {
    workflows: ['action-os', 'workflows'],
    runs: () => ['action-os', 'runs'],
    approvals: ['action-os', 'approvals'],
    actions: ['action-os', 'actions'],
  },
}))

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
const trackerMock = vi.hoisted(() => ({
  trackCrmWritebackConfirmed: vi.fn(),
  trackActionStarted: vi.fn(),
  trackActionCompleted: vi.fn(),
  trackActionAbandoned: vi.fn(),
}))
vi.mock('@/lib/product-tracker', () => trackerMock)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

// Les deux files voisines — écritures ERP et routines — sont lues par le centre.
// Vides par défaut : un test qui les concerne pose SES données, sinon un écran
// vert ne prouverait rien sur elles.
const DEFAULT_APPROVAL = {
  id: 'ap-1',
  run_id: 'run-1',
  required_level: 'n2_user_approval',
  state: 'pending',
  summary: 'Envoyer le récapitulatif — Claire Dubois (ACME)',
  estimated_credits: 0,
  expires_at: '2026-08-05T10:00:00.000Z',
  created_at: '2026-08-02T10:00:00.000Z',
  // #2200.13 / #2200.14 / #2200.21 — la même traçabilité qu'un run déjà rendu
  // (`RunTraceLine`), désormais servie AUSSI sur la carte encore en attente.
  trace: {
    trigger: 'manual',
    triggeredByName: 'Louis Schlegel',
    approvedByName: null,
    approvedAt: null,
    accountName: null,
  },
  nextStepKey: 'append_note',
}

const fixtures = vi.hoisted(() => ({
  runOverride: {} as Record<string, unknown>,
  extraRuns: [] as Record<string, unknown>[],
  approvals: [] as unknown[],
  erpRequests: [] as unknown[],
  crmRequests: [] as unknown[],
  routines: [] as unknown[],
  playbookSends: [] as unknown[],
  myActions: [] as unknown[],
  decideErp: vi.fn(),
  assignErp: vi.fn(),
  snoozeErp: vi.fn(),
  decideCrm: vi.fn(),
  reviseCrm: vi.fn(),
  assignCrm: vi.fn(),
  snoozeCrm: vi.fn(),
  bulkRejectCrm: vi.fn(),
  decideSend: vi.fn(),
  snoozeSend: vi.fn(),
  start: vi.fn(),
  assign: vi.fn(),
  snooze: vi.fn(),
  members: [] as unknown[],
  // #2200.34 — le rollback d'un pas déjà exécuté (`UndoStepButton`).
  dispatch: vi.fn(),
}))

// #2864 — le sélecteur « Confier à » lit les membres RÉELS de l'espace actif.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: fixtures.members, isLoading: false }),
}))

vi.mock('@/features/ats/api', () => ({
  useAtsWriteRequests: () => ({ data: fixtures.erpRequests, isLoading: false }),
  useDecideAtsWrite: () => ({ mutate: fixtures.decideErp, isPending: false, variables: undefined }),
  // #2864 / #2856 — reste du lot précédent : confier et reporter une écriture ERP.
  useAssignAtsWrite: () => ({ mutate: fixtures.assignErp, isPending: false, variables: undefined }),
  useSnoozeAtsWrite: () => ({ mutate: fixtures.snoozeErp, isPending: false, variables: undefined }),
}))
// #1508 — les écritures CRM ont rejoint cette file. Elles avaient leur propre
// écran ; le retour demandait « une seule maison pour toutes les décisions
// humaines avant exécution ».
vi.mock('@/features/crm/api', () => ({
  useCrmWriteRequests: () => ({ data: { status: 'ready', requests: fixtures.crmRequests }, isLoading: false }),
  useDecideCrmWrite: () => ({ mutate: fixtures.decideCrm, isPending: false, variables: undefined }),
  useReviseCrmWrite: () => ({ mutate: fixtures.reviseCrm, isPending: false, variables: undefined }),
  // #2864 / #2856 — reste du lot précédent : confier et reporter une écriture CRM.
  useAssignCrmWrite: () => ({ mutate: fixtures.assignCrm, isPending: false, variables: undefined }),
  useSnoozeCrmWrite: () => ({ mutate: fixtures.snoozeCrm, isPending: false, variables: undefined }),
  // #2854 (#2201.32) — annuler une sélection de demandes en attente.
  useBulkRejectCrmWrite: () => ({ mutate: fixtures.bulkRejectCrm, isPending: false, variables: undefined }),
}))
vi.mock('@/features/routines/api', () => ({
  useRoutines: () => ({ data: fixtures.routines, isLoading: false }),
}))
vi.mock('@/features/playbooks/api', () => ({
  usePlaybookApprovals: () => ({ data: fixtures.playbookSends, isLoading: false }),
  useDecidePlaybookSend: () => ({ mutate: fixtures.decideSend, isPending: false, variables: undefined }),
  // #2856 — reste : reporter une relance de playbook en attente.
  useSnoozePlaybookSend: () => ({ mutate: fixtures.snoozeSend, isPending: false, variables: undefined }),
}))
// #2200.34 — `UndoStepButton` dispatche le rollback par la même route que
// l'exécution d'un intent (`POST /actions/dispatch`), jamais réimplémentée ici.
vi.mock('@/features/actions/api', () => ({
  actionsApi: { dispatch: (...args: unknown[]) => fixtures.dispatch(...args) },
}))
// #2114.46/.57, #2200.33 — l'onglet « Mes relances ». Sans ce mock, le hook
// appelle `apiFetch` pour de vrai : le `fetch` global de `test/setup.ts`
// répond `{}`, et `MyRelancesList` reçoit un objet là où il attend un
// tableau (`actions.map is not a function`) — un faux négatif d'environnement,
// pas un défaut de ce fichier.
// #2717 — le spy capture l'argument `overdueOnly` reçu, sans changer la
// réponse : les tests existants qui ignorent l'argument restent valides.
const useMyActionsSpy = vi.fn()
vi.mock('@/features/actions/hooks/useMyActions', () => ({
  useMyActions: (overdueOnly?: boolean) => {
    useMyActionsSpy(overdueOnly)
    return { data: fixtures.myActions, isLoading: false }
  },
}))
// `Link` sort du routeur : sans contexte de route il jette, et l'écran entier
// disparaît — exactement le faux négatif qu'on ne veut pas diagnostiquer deux fois.
// Le `to` est reporté sur le `href` : un mock qui l'avale rendrait indistinguables
// « la porte est ouverte » et « la porte mène ailleurs ».
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

beforeEach(() => {
  trackerMock.trackCrmWritebackConfirmed.mockClear()
  trackerMock.trackActionStarted.mockClear()
  trackerMock.trackActionCompleted.mockClear()
  trackerMock.trackActionAbandoned.mockClear()
  fixtures.runOverride = {}
  fixtures.extraRuns = []
  fixtures.approvals = [DEFAULT_APPROVAL]
  fixtures.erpRequests = []
  fixtures.crmRequests = []
  fixtures.routines = []
  fixtures.playbookSends = []
  fixtures.myActions = []
  fixtures.decideErp.mockClear()
  fixtures.assignErp.mockClear()
  fixtures.snoozeErp.mockClear()
  fixtures.decideCrm.mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  fixtures.reviseCrm.mockClear()
  fixtures.assignCrm.mockClear()
  fixtures.snoozeCrm.mockClear()
  fixtures.bulkRejectCrm.mockClear()
  fixtures.decideSend.mockClear()
  fixtures.snoozeSend.mockClear()
  fixtures.start.mockReset()
  fixtures.assign.mockClear()
  fixtures.snooze.mockClear()
  fixtures.dispatch.mockReset()
  fixtures.dispatch.mockResolvedValue({ type: 'cancel_reminder', status: 'done' })
  fixtures.members = []
  useMyActionsSpy.mockClear()
  // Par défaut la requête reste EN VOL : c'est l'état pendant lequel quelqu'un
  // rafraîchit et reclique, donc celui qu'on teste.
  fixtures.start.mockImplementation(() => new Promise(() => {}))
  sessionStorage.clear()
})

function renderCenter(props?: {
  initialTab?: 'mine'
  historyTab?: 'running' | 'done' | 'failed' | 'scheduled' | 'workflows' | 'snoozed'
  overdueOnly?: boolean
  filters?: QueueFilterValues
  onFiltersChange?: (patch: QueueFilterValues) => void
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ActionCenter {...props} />
    </QueryClientProvider>,
  )
}

describe('Centre d’actions', () => {
  it('ouvre sur « À valider » et montre le résumé figé de la demande', async () => {
    renderCenter()
    expect(await screen.findByText(/Envoyer le récapitulatif — Claire Dubois/)).toBeInTheDocument()
    // #4463 — le résumé figé ne dit plus « aucun crédit » : il ne parle d'aucun crédit.
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  it('#2200.13/.14/.21 — la carte en attente nomme l’auteur, le déclencheur et la prochaine étape', async () => {
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    expect(screen.getByText(/Déclenchée par Louis Schlegel/)).toBeInTheDocument()
    expect(screen.getByText(/prochaine étape : Ajouter la note d'activité/)).toBeInTheDocument()
  })

  it('ne montre pas une clé technique brute comme « prochaine étape : Effect » (L-A)', async () => {
    fixtures.approvals = [{ ...DEFAULT_APPROVAL, nextStepKey: 'effect' }]
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    expect(screen.getByText(/Déclenchée par Louis Schlegel/)).toBeInTheDocument()
    expect(screen.queryByText(/prochaine étape/)).not.toBeInTheDocument()
  })

  it('approuve au clic — et n’envoie rien avant', async () => {
    const user = userEvent.setup()
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    expect(decide).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Approuver/ }))
    await waitFor(() => expect(decide).toHaveBeenCalledWith('ap-1', 'approve'))
  })

  // #2958 / #2154.30 — action_started / action_completed sur la destination `/actions`.
  it('#2154.30 — approuver mesure le geste sur /actions : démarré au clic, terminé au succès', async () => {
    const user = userEvent.setup()
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    expect(trackerMock.trackActionStarted).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Approuver/ }))
    await waitFor(() => expect(trackerMock.trackActionCompleted).toHaveBeenCalledWith('approval_decided', '/actions'))
    expect(trackerMock.trackActionStarted).toHaveBeenCalledWith('approval_decided', '/actions')
    expect(trackerMock.trackActionAbandoned).not.toHaveBeenCalled()
  })

  it('affiche le coût annoncé À CÔTÉ du coût réel', async () => {
    // Sans cette confrontation, un devis n'est jamais vérifiable après coup.
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    // #4463 — le devis et le débit réel ne se lisent plus côté client : la ligne de coût a disparu.
    expect(await screen.findByText(/CRM indisponible/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit|Coût annoncé|réellement débité/i)).not.toBeInTheDocument()
  })

  it('dit pourquoi un pas a échoué, au lieu d’un statut nu', async () => {
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    expect(await screen.findByText(/CRM indisponible/)).toBeInTheDocument()
  })

  it('liste le catalogue même quand rien n’a tourné — l’écran n’est jamais vide', async () => {
    const user = userEvent.setup()
    renderCenter()
    // #1498 — « Workflows » (anglais, dans une interface française) se confondait
    // avec « Parcours ». Le catalogue s'appelle « Automatisations ».
    await user.click(await screen.findByRole('button', { name: /Automatisations/ }))
    expect(await screen.findByText('Hygiène CRM')).toBeInTheDocument()
    expect(screen.getByText(/2 étapes/)).toBeInTheDocument()
  })

  /**
   * #2200.8 / #2200.18 / #2201.20 — CE QUE CHAQUE PAS FERA, et sous quelle
   * PERMISSION. `expectedResult` et `permission` existent au contrat depuis
   * l'origine (`workflowStepSchema`, action-os.ts:324,331) sans AUCUN appelant
   * d'affichage : le catalogue ne comptait que le NOMBRE de pas.
   */
  it('dit ce que chaque pas produira et sous quelle permission — pas seulement leur nombre', async () => {
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Automatisations/ }))

    expect(await screen.findByText('La fiche existe dans le CRM avec ses champs à jour.')).toBeInTheDocument()
    expect(screen.getByText('Une note d’activité datée est visible sur la fiche.')).toBeInTheDocument()
    // Repli lisible sur la permission technique, jamais la clé brute affichée seule.
    expect(screen.getByText(/contacts write/i)).toBeInTheDocument()
    expect(screen.getByText(/notes write/i)).toBeInTheDocument()
  })

  it('réunit les demandes d’écriture ERP avec les approbations — une seule file à surveiller', async () => {
    fixtures.erpRequests = [
      {
        id: 'w-1',
        kind: 'update_tjm',
        preview: 'Passer le TJM de Marc Aubriot à 700 €',
        createdAt: '2026-08-09T10:00:00.000Z',
        expiresAt: '2026-08-12T10:00:00.000Z',
        requestedByYou: false,
        canDecide: true,
        blockedReason: null,
      },
    ]
    renderCenter()
    // Les deux files sont sur le MÊME onglet, sans clic supplémentaire.
    expect(await screen.findByText(/Envoyer le récapitulatif — Claire Dubois/)).toBeInTheDocument()
    expect(await screen.findByText(/Passer le TJM de Marc Aubriot/)).toBeInTheDocument()
  })

  it('n’affiche pas de bouton qu’il sait déjà refusé — il montre la raison', async () => {
    fixtures.erpRequests = [
      {
        id: 'w-2',
        kind: 'update_tjm',
        preview: 'Passer le TJM de Marc Aubriot à 700 €',
        createdAt: '2026-08-09T10:00:00.000Z',
        expiresAt: '2026-08-12T10:00:00.000Z',
        requestedByYou: true,
        canDecide: false,
        blockedReason: 'Une validation responsable ne peut pas être accordée par son propre demandeur.',
      },
    ]
    renderCenter()
    expect(await screen.findByText(/par son propre demandeur/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Valider l’écriture/ })).not.toBeInTheDocument()
  })

  /**
   * #2864 / #2856 — reste du lot précédent : même motif que la CRM plus haut
   * (`AtsWriteService.assign`/`.snooze` et leurs migrations existaient déjà,
   * sans aucun appelant écran).
   */
  describe('confier et reporter une écriture ERP (#2864 / #2856)', () => {
    const ERP_REQUEST = {
      id: 'w-3',
      kind: 'update_tjm' as const,
      preview: 'Passer le TJM de Marc Aubriot à 700 €',
      createdAt: '2026-08-09T10:00:00.000Z',
      expiresAt: '2026-08-12T10:00:00.000Z',
      requestedByYou: false,
      canDecide: true,
      blockedReason: null,
    }

    it('confie la demande à un collègue de l’espace', async () => {
      const user = userEvent.setup()
      fixtures.members = [
        { userId: 'u1', email: 'moi@esn.fr', fullName: 'Moi', role: 'sales', isSelf: true },
        { userId: 'u2', email: 'claire@esn.fr', fullName: 'Claire Martin', role: 'sales', isSelf: false },
      ]
      fixtures.erpRequests = [ERP_REQUEST]
      renderCenter()
      await screen.findByText(/Passer le TJM de Marc Aubriot/)
      await user.click(screen.getByRole('combobox', { name: /Confier/ }))
      await user.click(await screen.findByRole('option', { name: 'Claire Martin' }))
      await waitFor(() => expect(fixtures.assignErp).toHaveBeenCalledWith({ id: 'w-3', assigneeId: 'u2' }))
    })

    it('reporte à demain — sans rien approuver', async () => {
      const user = userEvent.setup()
      const future = new Date(Date.now() + 3 * 24 * 3600_000 - 60_000).toISOString()
      fixtures.erpRequests = [{ ...ERP_REQUEST, expiresAt: future }]
      renderCenter()
      await screen.findByText(/Passer le TJM de Marc Aubriot/)
      await user.click(screen.getByRole('button', { name: /Reporter à demain/ }))
      await waitFor(() => expect(fixtures.snoozeErp).toHaveBeenCalledWith({ id: 'w-3', until: expect.any(String) }))
      expect(fixtures.decideErp).not.toHaveBeenCalled()
    })

    it('signale une demande déjà confiée à l’utilisateur courant', async () => {
      fixtures.erpRequests = [{ ...ERP_REQUEST, assignedTo: 'u1' }]
      renderCenter()
      await screen.findByText(/Passer le TJM de Marc Aubriot/)
      expect(screen.getByText(/Confiée à toi/)).toBeInTheDocument()
    })
  })

  it('annonce la RÈGLE d’exécution d’une automatisation, jamais une date calculée ici', async () => {
    fixtures.routines = [
      {
        definition: {
          key: 'daily_briefing',
          name: { fr: 'Brief du jour', en: 'Daily brief' },
          description: { fr: '', en: '' },
          outcome: { fr: '', en: '' },
          cadence: 'weekdays',
          defaultHour: 8,
          defaultWeekday: null,
          requires: [],
          defaultChannel: 'in_app',
          defaultEnabled: true,
        },
        subscription: {
          key: 'daily_briefing',
          enabled: true,
          hour: 8,
          weekday: null,
          channel: 'in_app',
          timeZone: 'Europe/Paris',
        },
        blockers: [],
        lastRunAt: null,
        lastOutcome: null,
      },
    ]
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Planifiées/ }))
    expect(await screen.findByText(/Du lundi au vendredi à 08:00 \(Europe\/Paris\)/)).toBeInTheDocument()
    expect(screen.getByText(/Jamais exécutée/)).toBeInTheDocument()
  })

  it('sépare une automatisation activée qui ne PEUT pas tourner — sinon on attend un brief qui n’arrivera jamais', async () => {
    fixtures.routines = [
      {
        definition: {
          key: 'mission_ending',
          name: { fr: 'Fin de mission', en: 'Mission ending' },
          description: { fr: '', en: '' },
          outcome: { fr: '', en: '' },
          cadence: 'daily',
          defaultHour: 9,
          defaultWeekday: null,
          requires: ['ats'],
          defaultChannel: 'in_app',
          defaultEnabled: true,
        },
        subscription: {
          key: 'mission_ending',
          enabled: true,
          hour: 9,
          weekday: null,
          channel: 'in_app',
          timeZone: 'Europe/Paris',
        },
        blockers: ['ats_not_connected'],
        lastRunAt: null,
        lastOutcome: null,
      },
    ]
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Planifiées/ }))
    expect(await screen.findByText(/ne peut pas tourner/)).toBeInTheDocument()
    expect(screen.getByText('ERP non connecté')).toBeInTheDocument()
  })

  it('ouvre la porte qu’il NOMME quand rien n’est programmé', async () => {
    // Le texte disait « elles se règlent dans Réglages › Routines » et n'y menait
    // pas : l'écran écrivait l'adresse et refusait de l'ouvrir. Le lien de
    // gestion n'existait que sous une liste NON vide — donc jamais au moment où
    // la question se pose.
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Planifiées/ }))
    expect(await screen.findByText(/Aucune automatisation programmée/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Régler les automatisations/ })).toHaveAttribute(
      'href',
      '/settings/routines',
    )
  })

  it('#3419 — « À valider » mène au centre d’approbation des messages (là où un message bloqué se lit)', async () => {
    // Recette prod 02/10 : le message « Votre plateforme data » (bloqué) était
    // introuvable par clics — le centre d'approbation n'est monté que sous
    // Actions › Séquences et rien, depuis « À valider », n'y menait.
    renderCenter()
    expect(await screen.findByRole('link', { name: /Messages à valider/ })).toHaveAttribute(
      'href',
      '/actions/sequences',
    )
  })

  it('explique un onglet vide plutôt que de rester blanc', async () => {
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /En cours/ }))
    expect(await screen.findByText(/Aucune exécution dans cet état/)).toBeInTheDocument()
  })

  it('nomme un run PLANIFIÉ dans l’onglet « En cours » — #2123.39', async () => {
    // `workflow-runner.service.ts:268` crée le run en `planned` tant qu'il n'a
    // pas été LANCÉ (bouton « Lancer ») : ce n'est pas un état transitoire —
    // `RUNNING_STATUSES` l'inclut nommément aux côtés de `running`, et il reste
    // dans cet état jusqu'au clic. `StatusBadge` le traduisait déjà, rien ne
    // l'affirmait à l'écran.
    fixtures.runOverride = { status: 'planned' }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /En cours/ }))
    expect(await screen.findByText('Planifiée')).toBeInTheDocument()
  })

  // #2401.8 — les QUATRE états qu'un utilisateur doit voir : « en attente »
  // (couvert ci-dessus, l'écran ouvre dessus) et « en cours » (ci-dessus,
  // `planned`) avaient déjà leur appelant réel (`StatusBadge`, `RunList`) mais
  // aucun test ne prouvait « terminé » et « échoué » — seul le compteur de
  // pastille en dépendait, jamais le libellé affiché dans la liste elle-même.
  it('nomme un run TERMINÉ dans l’onglet « Terminées » — #2401.8', async () => {
    fixtures.runOverride = { status: 'done' }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Terminée')).toBeInTheDocument()
  })

  it('#3416 — un run TERMINÉ dit ce qu’il a donné, jamais un « Terminée » muet', async () => {
    fixtures.runOverride = { status: 'done' }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Résultat')).toBeInTheDocument()
  })

  it('#3416 — « ce que ça apprend » seulement quand un pas porte une raison ; cartes à largeur pleine', async () => {
    fixtures.runOverride = {
      status: 'done',
      steps: [
        {
          key: 'enrich',
          intentType: 'enrich_contact',
          outcome: 'done',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: 'Deux décideurs ajoutés.',
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Ce que ça apprend')).toBeInTheDocument()
    const card = screen.getByText('Ce que ça apprend').closest('li')
    expect(card?.className).toContain('w-full')
  })

  // #3416 (recette prod Y8 02/10) — « DOUBLON : sa phrase répète l'étape
  // juste au-dessus (60 jours 2×) ». La raison d'un pas d'un run terminé vit à
  // UN endroit : « Ce que ça apprend ».
  it('#3416 — la raison d’un pas d’un run TERMINÉ n’apparaît qu’une fois', async () => {
    fixtures.runOverride = {
      status: 'done',
      steps: [
        {
          key: 'flag_dormant',
          intentType: 'enrich_contact',
          outcome: 'done',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: 'Aucun mouvement depuis 60 jours.',
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    await screen.findByText('Ce que ça apprend')
    expect(screen.getAllByText(/Aucun mouvement depuis 60 jours\./)).toHaveLength(1)
  })

  it('#3416 — un run TERMINÉ sans raison de pas ne montre pas « ce que ça apprend »', async () => {
    fixtures.runOverride = { status: 'done' }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    await screen.findByText('Résultat')
    expect(screen.queryByText('Ce que ça apprend')).toBeNull()
  })

  it('#3416 — un run TERMINÉ sans aucun pas ne montre ni « 0 sur 0 » ni « (s) » : pas de ligne', async () => {
    fixtures.runOverride = { status: 'done', steps: [] }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Terminée')).toBeInTheDocument()
    expect(screen.queryByText('Résultat')).toBeNull()
    expect(screen.queryByText(/\(s\)/)).toBeNull()
  })

  // #3416.x2 — l'analyse de compte n'a aucun pas : son « Ce que ça apprend » vient
  // du résultat réel stocké sur le run (contacts trouvés), jamais d'un texte inventé.
  it('#3416.x2 — une analyse de compte terminée dit ce qu’elle a trouvé', async () => {
    fixtures.runOverride = {
      status: 'done',
      steps: [],
      result: { analysisFound: { contacts: 5, verifiedEmails: 2 } },
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Ce que ça apprend')).toBeInTheDocument()
    expect(screen.getByText(/5 contacts trouvés, dont 2 avec un e-mail vérifié/)).toBeInTheDocument()
  })

  it('#3416.x2 — une analyse terminée sans résultat stocké : la ligne n’apparaît pas', async () => {
    fixtures.runOverride = { status: 'done', steps: [], result: null }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Terminée')).toBeInTheDocument()
    expect(screen.queryByText('Ce que ça apprend')).toBeNull()
  })

  it('X37 / #3416 — la prochaine action d’un run terminé se lit, tirée de la tâche ouverte du compte', async () => {
    fixtures.runOverride = {
      status: 'done',
      nextAction: { title: 'Relancer sur les deux profils conformité', dueOn: '2026-09-30' },
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Prochaine action')).toBeInTheDocument()
    expect(screen.getByText(/Relancer sur les deux profils conformité/)).toBeInTheDocument()
  })

  // #3416 (recette démo 10/10) — deux cartes d'un MÊME compte (deux automatisations sur Société Générale)
  // portaient la même « Prochaine action » : la tâche est celle du COMPTE, pas du run. Une seule ligne.
  const sameAccountRun = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    definition_key: 'crm_hygiene',
    definition_version: 1,
    trigger: 'manual',
    status: 'done',
    account_id: 'acc-sg',
    contact_id: null,
    correlation_id: id,
    steps: [],
    estimated_credits: 0,
    spent_credits: 0,
    started_at: null,
    finished_at: null,
    created_at: '2026-08-01T09:00:00.000Z',
    nextAction: { title: 'Relancer sur les deux profils conformité', dueOn: '2026-10-08' },
    ...extra,
  })

  it('#3416 — deux runs terminés du même compte : la prochaine action ne se lit qu’UNE fois', async () => {
    fixtures.runOverride = sameAccountRun('run-1')
    fixtures.extraRuns = [sameAccountRun('run-2')]
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    await screen.findAllByText('Terminée')
    expect(screen.getAllByText(/Relancer sur les deux profils conformité/)).toHaveLength(1)
  })

  it('#3416 — sait dire NON : deux comptes différents gardent chacun leur prochaine action', async () => {
    fixtures.runOverride = sameAccountRun('run-1')
    fixtures.extraRuns = [sameAccountRun('run-2', { account_id: 'acc-other' })]
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    await screen.findAllByText('Terminée')
    expect(screen.getAllByText(/Relancer sur les deux profils conformité/)).toHaveLength(2)
  })

  it('X37 / #3416 — sans tâche ouverte, aucune ligne « Prochaine action » (une absence ne fait pas de ligne)', async () => {
    fixtures.runOverride = { status: 'done', nextAction: null }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Terminée')).toBeInTheDocument()
    expect(screen.queryByText('Prochaine action')).toBeNull()
  })

  it('nomme un run ÉCHOUÉ dans l’onglet « À reprendre » — #2401.8', async () => {
    fixtures.runOverride = { status: 'failed' }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    expect(await screen.findByText('Échouée')).toBeInTheDocument()
  })

  // #2200.23 — « Action : Ouvrir » n'avait aucun bouton « ouvrir le
  // compte/contact » sur une carte : `run.account_id`/`run.contact_id`
  // arrivaient déjà par le contrat, sans appelant d'affichage.
  it('#2200.23 — ouvre le compte ET le contact d’un run depuis sa carte', async () => {
    fixtures.runOverride = { status: 'failed', account_id: 'acc-1', contact_id: 'contact-1' }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    const openAccount = await screen.findByRole('link', { name: /ouvrir le compte/i })
    expect(openAccount.getAttribute('href')).toContain('/accounts')
    const openContact = await screen.findByRole('link', { name: /ouvrir le contact/i })
    expect(openContact.getAttribute('href')).toContain('/contacts')
  })

  it('#2200.23 — n’offre aucun lien quand le run n’a ni compte ni contact', async () => {
    fixtures.runOverride = { status: 'failed', account_id: null, contact_id: null }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    await screen.findByText('Échouée')

    expect(screen.queryByRole('link', { name: /ouvrir le compte/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /ouvrir le contact/i })).not.toBeInTheDocument()
  })

  // #2200.45 — « Recette : action compréhensible sans code ». Le repli
  // `defaultValue: definition_key` / `step.key` laissait passer une clé
  // technique brute (snake_case) quand la traduction manquait : lisible pour
  // qui a lu le code, pas pour un commercial. Un défaut qu'aucune ligne
  // catalogue ne connaît doit rester COMPRÉHENSIBLE, jamais brut.
  it('#2200.45 — un workflow/pas sans traduction se lit, jamais en clé technique brute', async () => {
    fixtures.runOverride = {
      definition_key: 'unmapped_workflow_key',
      steps: [
        {
          key: 'unmapped_step_key',
          intentType: 'create_crm_task',
          outcome: 'done',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    expect(await screen.findByText('Unmapped workflow key')).toBeInTheDocument()
    expect(screen.getByText('Unmapped step key')).toBeInTheDocument()
    expect(screen.queryByText('unmapped_workflow_key')).not.toBeInTheDocument()
    expect(screen.queryByText('unmapped_step_key')).not.toBeInTheDocument()
  })

  // #4163 LF point 4 — recette prod 14/10 : une carte « Terminées » disait « Effect » (le pas unique d'une carte
  // du copilote, sans libellé) et « réf. c1d85f9c-… » (un identifiant interne). Un libellé humain, ou rien.
  it('#4163 LF — le pas unique d’une carte du copilote se lit « Exécution de l’action », jamais « Effect »', async () => {
    fixtures.runOverride = {
      status: 'done',
      steps: [
        {
          key: 'effect',
          intentType: 'generate_message',
          outcome: 'done',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText('Exécution de l’action')).toBeInTheDocument()
    expect(screen.queryByText('Effect')).not.toBeInTheDocument()
  })

  it('#4163 LF — une référence qui n’est qu’un UUID interne ne s’affiche pas ; une référence lisible oui', async () => {
    fixtures.runOverride = {
      status: 'done',
      steps: [
        {
          key: 'upsert_record',
          intentType: 'create_crm_task',
          outcome: 'done',
          attempts: 1,
          externalRef: 'c1d85f9c-4d5e-4f8a-9a3b-0a1b2c3d4e5f',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    await screen.findByText('Terminée')
    expect(screen.queryByText(/réf\./)).not.toBeInTheDocument()
    expect(screen.queryByText(/c1d85f9c/)).not.toBeInTheDocument()
  })

  it('#4163 LF — une référence lisible (clé de l’outil) reste affichée', async () => {
    fixtures.runOverride = {
      status: 'done',
      steps: [
        {
          key: 'upsert_record',
          intentType: 'create_crm_task',
          outcome: 'done',
          attempts: 1,
          externalRef: 'hs-1',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByText(/réf\. hs-1/)).toBeInTheDocument()
  })

  // #2858 — recette prod 26/09 21:20 (5650405018) : « En cours » rendait les
  // sept cartes gouvernées (`copilot-card-catalog.ts`) en anglicisme brut via
  // le repli `humanizeTechnicalKey` ci-dessus (« Card propose opportunity
  // update »...) — leur `definition_key` n'avait aucune entrée dans le
  // catalogue `center.workflow`, contrairement aux workflows plus anciens.
  it.each([
    ['card_propose_opportunity_update', 'Mettre à jour une opportunité'],
    ['card_export_contact_to_crm', 'Exporter vers le CRM'],
    ['card_prepare_message', 'Préparer un message'],
    ['card_prepare_mail_draft', 'Préparer un brouillon'],
    ['card_enrich_contact', 'Enrichir un contact'],
    ['card_schedule_reminder', 'Programmer un rappel'],
    ['card_toggle_routine', 'Régler une routine'],
  ])('#2858 — nomme la carte « %s » en clair, jamais en clé technique', async (definitionKey, label) => {
    fixtures.runOverride = { status: 'running', definition_key: definitionKey }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /En cours/ }))
    expect(await screen.findByText(label)).toBeInTheDocument()
  })

  // #2384.7 — l'audit d'un run listait déjà chaque pas avec son résultat et sa
  // raison, mais jamais combien de TENTATIVES il avait fallu : une reprise
  // réussie au 3ᵉ essai se lisait comme un simple « fait », indistinct d'un
  // succès au premier coup.
  it('#2384.7 — une étape reprise plusieurs fois affiche son nombre de tentatives', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'upsert_record',
          intentType: 'create_crm_task',
          outcome: 'done',
          attempts: 3,
          externalRef: 'hs-1',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
        {
          key: 'append_note',
          intentType: 'create_crm_note',
          outcome: 'failed',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: 'CRM indisponible',
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    const attemptMentions = await screen.findAllByText(/tentative/)
    // Une SEULE mention : l'étape reprise trois fois la porte, celle réussie du
    // premier coup (attempts: 1) n'affiche rien — bruit inutile sur l'immense
    // majorité des pas.
    expect(attemptMentions).toHaveLength(1)
    expect(attemptMentions[0].textContent).toContain('3 tentatives')
  })

  // #2384.7 (RÉFUTÉ en prod le 23/09) — l'audit nommait plan/tentative/retry/
  // résultat mais JAMAIS la compensation : un pas ANNULÉ (`outcome: 'cancelled'`)
  // se lisait exactement comme un pas jamais lancé (même icône Horloge), sans
  // dire si un rattrapage restait possible. `intentReversibility` (déjà tenue
  // par le gate d'approbation, #2400.8) donne la réponse SANS l'inventer :
  // un pas compensable le nomme, un pas irréversible nomme explicitement
  // qu'aucune compensation n'est possible plutôt que de se taire.
  it('#2384.7 — un pas ANNULÉ nomme sa compensation, jamais inventée', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'schedule_follow_up',
          intentType: 'create_crm_task', // compensable
          outcome: 'cancelled',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
        {
          key: 'send_intro_email',
          intentType: 'send_email', // irreversible
          outcome: 'cancelled',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    expect(await screen.findByText(/à compenser/)).toBeInTheDocument()
    expect(await screen.findByText(/aucune compensation possible/)).toBeInTheDocument()
  })

  // #2200.34 (épopée #2866) — `intentReversibility` ne faisait QU'annoncer
  // qu'un pas déjà exécuté restait rattrapable, sans jamais déclencher la
  // compensation réelle. Un pas `done` dont le rollback existe (épopée #2771)
  // propose désormais un geste qui l'exécute pour de vrai, ciblé sur l'id que
  // le pas d'origine a produit (`externalRef`) — jamais un id deviné.
  it('#2200.34 — un pas DÉJÀ EXÉCUTÉ propose un UNDO qui dispatche le rollback réel', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'schedule_follow_up',
          intentType: 'schedule_reminder',
          outcome: 'done',
          attempts: 1,
          externalRef: 'reminder-42',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
        // Un pas terminé sans rollback connu (`create_crm_note`) ne montre
        // aucun bouton — inventer un lien que le routeur ne tient pas.
        {
          key: 'append_note',
          intentType: 'create_crm_note',
          outcome: 'done',
          attempts: 1,
          externalRef: 'note-1',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    expect(await screen.findAllByRole('button', { name: 'Retirer le rappel' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Retirer le rappel' }))
    await waitFor(() =>
      expect(fixtures.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cancel_reminder', targetId: 'reminder-42' }),
      ),
    )
    // #2866 (décision 3) — un succès NOMME ce qui a été défait : jamais la
    // carte qui reste muette sur « Terminée », jamais un bouton qui resterait
    // cliquable pour rejouer le même rollback.
    expect(await screen.findByText('Annulée — rappel éteint')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer le rappel' })).toBeNull()
  })

  // Le même pas ANNULÉ AVANT exécution (`cancelled`) n'a rien à défaire :
  // aucun bouton ne doit apparaître, seulement le libellé de compensation
  // (couvert par le test #2384.7 ci-dessus).
  it('#2200.34 — un pas jamais exécuté ne montre pas de bouton UNDO', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'schedule_follow_up',
          intentType: 'schedule_reminder',
          outcome: 'cancelled',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    expect(screen.queryByRole('button', { name: 'Retirer le rappel' })).toBeNull()
  })

  // #2866 — recette 27/09 (réel) : « Annuler » n'était borné par AUCUNE
  // fenêtre — un pas exécuté il y a des mois restait annulable comme s'il
  // datait de la minute.
  it('#2866 — un pas exécuté HORS fenêtre (> 72h) ne montre plus de bouton Annuler', async () => {
    fixtures.runOverride = {
      status: 'done',
      steps: [
        {
          key: 'schedule_follow_up',
          intentType: 'schedule_reminder',
          outcome: 'done',
          attempts: 1,
          externalRef: 'reminder-42',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Terminées/ })).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(screen.queryByRole('button', { name: 'Retirer le rappel' })).toBeNull()
  })

  it('#2866 — un pas exécuté DANS la fenêtre (< 72h) montre toujours le bouton Annuler', async () => {
    fixtures.runOverride = {
      status: 'done',
      steps: [
        {
          key: 'schedule_follow_up',
          intentType: 'schedule_reminder',
          outcome: 'done',
          attempts: 1,
          externalRef: 'reminder-42',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Terminées/ }))
    expect(await screen.findByRole('button', { name: 'Retirer le rappel' })).toBeInTheDocument()
  })

  // #2866 — PROUVÉ EN PROD LE 27/09/2026 : sur la carte « Exporter vers le
  // CRM » (Terminée), un clic sur « Annuler » ne défaisait jamais rien —
  // aucune erreur, la carte restait « Terminée ».
  //
  // La cause réelle : `step.externalRef` d'un pas `create_crm_task` est
  // l'identifiant CHEZ LE CRM (`dispatchCrmTask`, `action-router.service.ts`)
  // — gardé tel quel pour « LA PREUVE » (#2200.20/#2201.40, le lien/texte
  // affiché en pied de carte). `remove_crm_task` (`dispatchRemoveCrmTask`)
  // ne cherche PAS ce record CRM : il cherche une ligne `user_actions` PAR
  // SON ID (`removeCrmTaskIntentSchema.targetId`, un UUID) pour y relire
  // `metadata.crm_provider` / `metadata.external_ref` et savoir OÙ écrire la
  // note rectificative. Un id CRM (`hs-1`, jamais un UUID) envoyé comme
  // `targetId` échoue donc TOUJOURS — silencieusement pour l'utilisateur,
  // qui ne voit qu'un bouton qui ne fait rien.
  //
  // Fermer l'écart demanderait de faire voyager un second identifiant
  // (celui de la ligne `user_actions`) jusqu'au pas de run — un chantier de
  // plusieurs jours, hors de ce lot. La règle du dépôt tranche déjà le cas :
  // « si la compensation d'un type n'existe pas, le bouton ne s'affiche pas
  // pour ce type — jamais un bouton qui ne fait rien. » `create_crm_task`
  // sort donc de `UNDO_ROLLBACK`.
  it('#2866 — un pas « create_crm_task » déjà exécuté ne montre PAS de bouton Annuler (la compensation cible un id que ce pas ne porte pas)', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'upsert_record',
          intentType: 'create_crm_task',
          outcome: 'done',
          attempts: 1,
          externalRef: 'hs-1',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))
    await screen.findByText('Remonter la fiche dans le CRM')
    expect(screen.queryByRole('button', { name: 'Retirer le rappel' })).toBeNull()
  })
})

describe('Centre d’actions — l’onglet « Mes relances » (#2200.33)', () => {
  // #2200.33 — COCHER UNE TÂCHE NE SIGNIFIE JAMAIS QU'UNE ACTION EXTERNE A ÉTÉ
  // EXÉCUTÉE. L'issue exige le libellé EXACT « Cette tâche sera uniquement
  // marquée terminée. » avant le geste : le rond « fait » de `MyRelancesList`
  // n'écrit rien dans le CRM/ERP du client, il change seulement le statut de
  // la ligne `action_plan_items`, et rien sur l'écran ne le disait.
  it('affiche le libellé exact avant de cocher une relance', async () => {
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /Mes relances/ }))
    expect(await screen.findByText('Cette tâche sera uniquement marquée terminée.')).toBeInTheDocument()
  })
})

describe('Centre d’actions — les relances automatiques à valider', () => {
  const PENDING = {
    id: 'ps-1',
    playbook: 'mission_renewal',
    recipient: 'marie@acme.example',
    subject: 'Mission ACME — on prépare la suite ?',
    body: 'Bonjour Marie,\n\nLa mission arrive à échéance le 30 septembre.',
    requestedAt: '2026-08-26T10:00:00.000Z',
    expiresAt: '2026-08-29T10:00:00.000Z',
  }

  it('montre le DESTINATAIRE et le message exact — on ne valide pas en aveugle', async () => {
    fixtures.playbookSends = [PENDING]
    renderCenter()
    expect(await screen.findByText(/marie@acme\.example/)).toBeInTheDocument()
    expect(screen.getByText(PENDING.subject)).toBeInTheDocument()
    // Le corps est LÀ, pas replié derrière un « voir plus » : le replier ferait
    // valider sans lire, ce qui est exactement ce qu'on évite.
    expect(screen.getByText(/La mission arrive à échéance/)).toBeInTheDocument()
  })

  it('#2200.13/.14/.21 — la relance nomme auteur, source et prochaine action', async () => {
    fixtures.playbookSends = [PENDING]
    renderCenter()
    const trace = await screen.findByTestId('queue-trace-line')
    expect(trace.textContent).toContain('Préparée par Laura')
    expect(trace.textContent).toContain('Depuis une relance automatique')
    expect(trace.textContent).toContain('Part après ta validation')
  })

  it('dit « Envoyer » et non « Approuver » — le bouton envoie', async () => {
    fixtures.playbookSends = [PENDING]
    renderCenter()
    expect(await screen.findByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
  })

  // #2200.17, #2201.12 — la carte ne nommait ni « canal » ni « outil » : les
  // écritures CRM/ERP le disent déjà DANS leur libellé (« vers ton CRM »,
  // « dans l'ERP », depuis #1508) ; une relance automatique ne disait rien.
  // La CAPACITÉ, jamais l'éditeur — cette relance part par la messagerie du
  // commercial, jamais un fournisseur ne se nomme.
  it('#2200.17/#2201.12 — nomme la capacité (« ta messagerie »), jamais un éditeur', async () => {
    fixtures.playbookSends = [PENDING]
    renderCenter()
    expect(await screen.findByText(/Ta messagerie/)).toBeInTheDocument()
  })

  it('#2201.23 — nomme aussi le CANAL, à côté de la capacité', async () => {
    fixtures.playbookSends = [PENDING]
    renderCenter()
    expect(await screen.findByText('Ta messagerie · E-mail')).toBeInTheDocument()
  })

  it('les compte dans l’onglet « À valider », avec les deux autres files', async () => {
    fixtures.playbookSends = [PENDING, { ...PENDING, id: 'ps-2' }]
    renderCenter()
    // Une approbation d'Action OS est déjà servie par le mock : 2 + 1 = 3.
    await waitFor(() => expect(screen.getByRole('button', { name: /À valider/ }).textContent).toContain('3'))
  })

  it('transmet la décision telle quelle', async () => {
    fixtures.playbookSends = [PENDING]
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: 'Envoyer' }))
    expect(fixtures.decideSend).toHaveBeenCalledWith({ id: 'ps-1', decision: 'approve' })
  })

  it('n’affiche RIEN quand il n’y a rien à valider — l’état vide appartient à la file voisine', async () => {
    // Trois listes qui diraient chacune « rien à valider » feraient trois vides
    // pour une seule question.
    renderCenter()
    expect(await screen.findByText(/Envoyer le récapitulatif/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
  })

  // #2856 — reste : le report existait déjà côté serveur (`PlaybooksService.snooze`,
  // `POST /playbooks/approvals/:id/snooze`) mais aucune surface web ne l'appelait.
  describe('reporter une relance de playbook (#2856)', () => {
    it('reporte à demain — sans rien envoyer', async () => {
      const user = userEvent.setup()
      const future = new Date(Date.now() + 3 * 24 * 3600_000 - 60_000).toISOString()
      fixtures.playbookSends = [{ ...PENDING, expiresAt: future }]
      renderCenter()
      await screen.findByText(/marie@acme\.example/)
      await user.click(screen.getByRole('button', { name: /Reporter à demain/ }))
      await waitFor(() => expect(fixtures.snoozeSend).toHaveBeenCalledWith({ id: 'ps-1', until: expect.any(String) }))
      expect(fixtures.decideSend).not.toHaveBeenCalled()
    })

    it('une relance reportée sort de la file active, reste nommée, et se réveille', async () => {
      const user = userEvent.setup()
      const until = new Date(Date.now() + 1800_000).toISOString()
      fixtures.playbookSends = [{ ...PENDING, snoozedUntil: until }]
      renderCenter()
      // Hors de la file active : le bouton « Envoyer » n'est plus proposé.
      expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
      // Mais nommée — jamais cachée — sous « Reportées ».
      await screen.findByText(/marie@acme\.example/)
      await user.click(screen.getByRole('button', { name: 'Réveiller' }))
      expect(fixtures.snoozeSend).toHaveBeenCalledWith({ id: 'ps-1', until: null })
    })
  })
})

/**
 * #1508 — « une seule maison pour toutes les décisions humaines avant exécution ».
 *
 * Les écritures CRM avaient leur propre écran, alimenté par une source
 * DIFFÉRENTE de celle du Centre (`useCrmWriteRequests` d'un côté,
 * `useAtsWriteRequests` de l'autre). Retirer l'écran sans amener sa file ici
 * aurait supprimé la capacité au lieu de la déplacer.
 */
describe('Les écritures CRM dans la file unique', () => {
  const CRM_REQUEST = {
    id: 'cw-1',
    kind: 'create_note' as const,
    preview: [
      { field: 'Société', value: 'ACME' },
      { field: 'Note', value: 'Rendez-vous fixé au 12/09.' },
    ],
    origin: 'user' as const,
    createdAt: '2026-09-02T10:00:00.000Z',
    expiresAt: '2026-09-05T10:00:00.000Z',
    requestedByYou: true,
  }

  it('montre le diff champ par champ, tel que le serveur l’a figé', async () => {
    fixtures.crmRequests = [CRM_REQUEST]
    renderCenter()
    expect(await screen.findByText('Note à déposer dans ton CRM')).toBeInTheDocument()
    expect(screen.getByText('Société')).toBeInTheDocument()
    expect(screen.getByText(/Rendez-vous fixé au 12\/09\./)).toBeInTheDocument()
  })

  it('#2200.13 — nomme l’auteur de la demande CRM (toi, un autre membre, ou une automatisation)', async () => {
    fixtures.crmRequests = [
      CRM_REQUEST,
      { ...CRM_REQUEST, id: 'cw-2', requestedByYou: false },
      { ...CRM_REQUEST, id: 'cw-3', origin: 'system' as const },
    ]
    renderCenter()
    await screen.findByText('Demandée par toi')
    expect(screen.getByText('Demandée par un autre membre')).toBeInTheDocument()
    expect(screen.getByText('Demandée par une automatisation')).toBeInTheDocument()
  })

  it('#4186.2 — nomme VERS QUEL CRM part l’écriture, par l’espace de l’utilisateur — jamais l’éditeur', async () => {
    fixtures.crmRequests = [
      { ...CRM_REQUEST, destination: 'Exteam — CRM' },
      // Sans nom connu : aucune ligne « Vers … » inventée.
      { ...CRM_REQUEST, id: 'cw-2', destination: null },
    ]
    renderCenter()
    expect(await screen.findByText('Vers Exteam — CRM')).toBeInTheDocument()
    expect(screen.getAllByText(/^Vers /)).toHaveLength(1)
  })

  /**
   * ⚠️ LE DÉFAUT QUE CE TEST GARDE.
   *
   * `ApprovalList` décide d'afficher « rien à valider » d'après le nombre
   * d'éléments des files VOISINES. Ajouter une file sans la compter fait dire
   * « rien à valider » JUSTE AU-DESSUS de ce qu'il y a à valider — la famille
   * « compteur juste, filtre faux ». C'est pourquoi le paramètre s'appelle
   * `othersCount` et non `erpCount`.
   */
  it('n’annonce PAS « rien à valider » quand seule la file CRM est pleine', async () => {
    fixtures.approvals = []
    fixtures.crmRequests = [CRM_REQUEST]
    renderCenter()
    expect(await screen.findByText('Note à déposer dans ton CRM')).toBeInTheDocument()
    expect(screen.queryByText(/Rien à valider/i)).not.toBeInTheDocument()
  })

  it('compte ces demandes dans la pastille « À valider »', async () => {
    fixtures.crmRequests = [CRM_REQUEST, { ...CRM_REQUEST, id: 'cw-2' }]
    renderCenter()
    // Une approbation d'Action OS est servie par défaut : 2 + 1 = 3.
    await waitFor(() => expect(screen.getByRole('button', { name: /À valider/ }).textContent).toContain('3'))
  })

  it('transmet la décision telle quelle', async () => {
    fixtures.crmRequests = [CRM_REQUEST]
    const user = userEvent.setup()
    renderCenter()
    await screen.findByText('Note à déposer dans ton CRM')
    const row = screen.getByText('Note à déposer dans ton CRM').closest('li')
    await user.click(within(row as HTMLElement).getByRole('button', { name: /Approuver/ }))
    expect(fixtures.decideCrm).toHaveBeenCalledWith({ id: 'cw-1', approve: true }, expect.anything())
  })

  /**
   * Lot X41 (02/10), #2958 — DÉFAUT RÉEL trouvé par le scénario #2154.28
   * (« deux utilisateurs simultanés », e2e) : décider une écriture CRM ne
   * disait RIEN — ni au succès, ni à l'échec. Les deux autres files de ce
   * centre (approbations, ERP) annoncent « approuvée / refusée » et, à l'échec,
   * le message du serveur ; celle-ci passait `onSuccess` pour la seule mesure.
   * Conséquence mesurée : un second membre qui clique sur une demande déjà
   * décidée (409 « déjà traitée ») voyait la carte disparaître sans un mot —
   * impossible de savoir si SA décision avait compté.
   */
  describe('#2958 — la décision d’une écriture CRM se dit, au succès comme à l’échec', () => {
    async function decide(name: RegExp) {
      fixtures.crmRequests = [CRM_REQUEST]
      const user = userEvent.setup()
      renderCenter()
      await screen.findByText('Note à déposer dans ton CRM')
      const row = screen.getByText('Note à déposer dans ton CRM').closest('li')
      await user.click(within(row as HTMLElement).getByRole('button', { name }))
      return fixtures.decideCrm.mock.calls[0]?.[1] as { onSuccess: () => void; onError: (error: Error) => void }
    }

    it('approuver réussi : « Écriture autorisée »', async () => {
      const options = await decide(/Approuver/)
      options.onSuccess()
      expect(toast.success).toHaveBeenCalledWith('Écriture autorisée')
    })

    it('refuser réussi : « Écriture refusée »', async () => {
      const options = await decide(/Refuser/)
      options.onSuccess()
      expect(toast.success).toHaveBeenCalledWith('Écriture refusée')
    })

    it('un refus du serveur (déjà traitée par un collègue) est DIT, avec la raison du serveur', async () => {
      const options = await decide(/Approuver/)
      options.onError(new Error('Cette demande a déjà été traitée'))
      expect(toast.error).toHaveBeenCalledWith('Cette demande a déjà été traitée')
      expect(toast.success).not.toHaveBeenCalled()
    })

    it('une erreur sans message retombe sur « La décision n’a pas pu être enregistrée »', async () => {
      const options = await decide(/Approuver/)
      options.onError(new Error(''))
      expect(toast.error).toHaveBeenCalledWith('La décision n’a pas pu être enregistrée')
    })
  })

  // #2319.129/.130 (épopée #2985) — `crm_writeback_confirmed` : UNIQUEMENT
  // quand la personne approuve (et que l'approbation réussit) une écriture
  // dont la provenance est un compte rendu. Un rejet, une échec ou une
  // écriture d'une autre provenance n'émet rien.
  describe('#2319.129/.130 — écriture CRM de compte rendu confirmée', () => {
    const FROM_NOTE = {
      ...CRM_REQUEST,
      target: {
        accountId: null,
        accountName: null,
        contactId: null,
        contactName: null,
        ownerId: null,
        ownerName: null,
        channel: null,
        risk: null,
        source: { kind: 'meeting_note' as const, ref: 'evt-1' },
      },
    }

    async function clickApprove() {
      const user = userEvent.setup()
      renderCenter()
      await screen.findByText('Note à déposer dans ton CRM')
      const row = screen.getByText('Note à déposer dans ton CRM').closest('li')
      await user.click(within(row as HTMLElement).getByRole('button', { name: /Approuver/ }))
      return fixtures.decideCrm.mock.calls[0]?.[1] as { onSuccess: () => void }
    }

    it('émet au succès d’une approbation d’une écriture venue d’un compte rendu', async () => {
      fixtures.crmRequests = [FROM_NOTE]
      const options = await clickApprove()
      expect(trackerMock.trackCrmWritebackConfirmed).not.toHaveBeenCalled()
      options.onSuccess()
      expect(trackerMock.trackCrmWritebackConfirmed).toHaveBeenCalledWith('/actions/')
    })

    it('sait dire NON : une écriture sans provenance de compte rendu n’émet rien', async () => {
      fixtures.crmRequests = [CRM_REQUEST]
      const options = await clickApprove()
      options.onSuccess()
      expect(trackerMock.trackCrmWritebackConfirmed).not.toHaveBeenCalled()
    })
  })

  /**
   * #2201.19 — LA CONSÉQUENCE, pas une case en plus : `target.risk` (NOMMÉ,
   * jamais une probabilité, `crm-write-request-view.ts:13-15`) voyageait déjà
   * dans le contrat sans qu'aucun écran ne le lise — un correctif de lecture
   * inerte. Une écriture `medium` (`enroll_sequence`/`update_deal_stage`)
   * touche plusieurs envois futurs ou tout le pipeline visible par l'équipe.
   */
  it('affiche la conséquence nommée quand le risque est connu', async () => {
    fixtures.crmRequests = [
      {
        ...CRM_REQUEST,
        kind: 'update_deal_stage' as const,
        target: {
          accountId: null,
          accountName: null,
          contactId: null,
          contactName: null,
          ownerId: null,
          ownerName: null,
          channel: null,
          risk: 'medium' as const,
        },
      },
    ]
    renderCenter()
    expect(await screen.findByText('Affaire à déplacer dans ton CRM')).toBeInTheDocument()
    expect(
      screen.getByText('Touche plusieurs envois à venir ou change ce que toute l’équipe voit.'),
    ).toBeInTheDocument()
  })

  /** Absence ≠ 0 (doctrine) : une demande d'avant ce champ (`target` omis, comme
   *  `CRM_REQUEST` ci-dessus) ne doit inventer AUCUNE conséquence. */
  it('ne montre aucune conséquence quand le risque n’est pas connu', async () => {
    fixtures.crmRequests = [CRM_REQUEST]
    renderCenter()
    await screen.findByText('Note à déposer dans ton CRM')
    expect(screen.queryByText(/Touche plusieurs envois|Se défait facilement|annulée automatiquement/)).toBeNull()
  })

  /**
   * #2855 (#2201.14) — LA PROVENANCE, pas un recalcul : `target.source`
   * voyageait déjà dans le contrat (lot précédent) sans qu'aucun écran ne le
   * lise. `kind` est une NATURE fermée qui se traduit côté client, jamais une
   * prose posée par le serveur.
   */
  it('affiche la provenance nommée quand elle est connue', async () => {
    fixtures.crmRequests = [
      {
        ...CRM_REQUEST,
        target: {
          accountId: null,
          accountName: null,
          contactId: null,
          contactName: null,
          ownerId: null,
          ownerName: null,
          channel: null,
          risk: null,
          source: { kind: 'meeting_note' as const, ref: 'evt-1' },
        },
      },
    ]
    renderCenter()
    await screen.findByText('Note à déposer dans ton CRM')
    expect(screen.getByText('Composée depuis un compte rendu')).toBeInTheDocument()
  })

  /** Absence ≠ 0 (doctrine) : `source` `null` (geste direct, ou non tracée
   *  encore) n'affiche AUCUNE provenance inventée. */
  it('ne montre aucune provenance quand la source n’est pas connue', async () => {
    fixtures.crmRequests = [CRM_REQUEST]
    renderCenter()
    await screen.findByText('Note à déposer dans ton CRM')
    expect(screen.queryByText(/Composée depuis|Composée par/)).toBeNull()
  })

  /**
   * #2854 (#2201.32) — « Annuler le lot ». Ce qui se teste : la sélection est
   * un état de l'écran (aucun appel tant que rien n'est sélectionné), et le
   * geste envoie les identifiants RÉELS des lignes cochées — jamais un
   * identifiant de « lot » inventé, puisqu'aucun objet de ce genre n'existe
   * côté serveur (`bulkReject` refuse chaque demande individuellement).
   */
  describe('annuler une sélection de demandes CRM en attente (#2854 / #2201.32)', () => {
    it('n’affiche aucun bouton d’annulation en lot tant que rien n’est sélectionné', async () => {
      fixtures.crmRequests = [CRM_REQUEST, { ...CRM_REQUEST, id: 'cw-2' }]
      renderCenter()
      await screen.findAllByText('Note à déposer dans ton CRM')
      expect(screen.queryByRole('button', { name: /Annuler la sélection/ })).not.toBeInTheDocument()
    })

    it('coche deux demandes puis annule la sélection — les DEUX identifiants réels, rien d’inventé', async () => {
      fixtures.crmRequests = [CRM_REQUEST, { ...CRM_REQUEST, id: 'cw-2' }]
      const user = userEvent.setup()
      renderCenter()
      await screen.findAllByText('Note à déposer dans ton CRM')
      const checkboxes = screen.getAllByRole('checkbox', { name: /Sélectionner cette demande/ })
      expect(checkboxes).toHaveLength(2)
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      expect(screen.getByText('2 demandes sélectionnées')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Annuler la sélection/ }))
      expect(fixtures.bulkRejectCrm).toHaveBeenCalledWith(['cw-1', 'cw-2'])
    })

    it('décoche une demande — elle sort de la sélection envoyée', async () => {
      fixtures.crmRequests = [CRM_REQUEST, { ...CRM_REQUEST, id: 'cw-2' }]
      const user = userEvent.setup()
      renderCenter()
      await screen.findAllByText('Note à déposer dans ton CRM')
      const checkboxes = screen.getAllByRole('checkbox', { name: /Sélectionner cette demande/ })
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])
      await user.click(checkboxes[0])
      expect(screen.getByText('1 demande sélectionnée')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Annuler la sélection/ }))
      expect(fixtures.bulkRejectCrm).toHaveBeenCalledWith(['cw-2'])
    })
  })

  /**
   * #2864 / #2856 — reste du lot précédent : le circuit existait déjà pour une
   * approbation Action OS ; les migrations et le moteur (`OutboundWriteService`)
   * portaient déjà `assigned_to`/`snoozed_until` pour une écriture CRM, sans
   * aucun appelant côté écran — exactement le motif qui revient dans ce dépôt.
   */
  describe('confier et reporter une écriture CRM (#2864 / #2856)', () => {
    it('confie la demande à un collègue de l’espace', async () => {
      const user = userEvent.setup()
      fixtures.members = [
        { userId: 'u1', email: 'moi@esn.fr', fullName: 'Moi', role: 'sales', isSelf: true },
        { userId: 'u2', email: 'claire@esn.fr', fullName: 'Claire Martin', role: 'sales', isSelf: false },
      ]
      fixtures.crmRequests = [CRM_REQUEST]
      renderCenter()
      await screen.findByText('Note à déposer dans ton CRM')
      await user.click(screen.getByRole('combobox', { name: /Confier/ }))
      await user.click(await screen.findByRole('option', { name: 'Claire Martin' }))
      await waitFor(() => expect(fixtures.assignCrm).toHaveBeenCalledWith({ id: 'cw-1', assigneeId: 'u2' }))
    })

    it('reporte à demain — sans rien approuver', async () => {
      const user = userEvent.setup()
      const future = new Date(Date.now() + 3 * 24 * 3600_000 - 60_000).toISOString()
      fixtures.crmRequests = [{ ...CRM_REQUEST, expiresAt: future }]
      renderCenter()
      await screen.findByText('Note à déposer dans ton CRM')
      await user.click(screen.getByRole('button', { name: /Reporter à demain/ }))
      await waitFor(() => expect(fixtures.snoozeCrm).toHaveBeenCalledWith({ id: 'cw-1', until: expect.any(String) }))
      expect(fixtures.decideCrm).not.toHaveBeenCalled()
    })

    it('signale une demande déjà confiée à l’utilisateur courant', async () => {
      fixtures.crmRequests = [{ ...CRM_REQUEST, assignedTo: 'u1' }]
      renderCenter()
      await screen.findByText('Note à déposer dans ton CRM')
      expect(screen.getByText(/Confiée à toi/)).toBeInTheDocument()
    })
  })
})

/**
 * #1498 — LA TRAÇABILITÉ D'UNE LIGNE.
 *
 * *« Chaque action importante doit permettre de comprendre : qui l'a déclenchée,
 * qui l'a validée, depuis quel objet […]. »* Les réponses existaient en base et
 * n'arrivaient nulle part. Ce qui se teste ici est ce qui se passe quand elles
 * N'EXISTENT PAS : la ligne doit se taire, jamais remplir.
 */
describe('La trace d’une exécution', () => {
  it('nomme qui a déclenché, qui a validé, et depuis quel compte', async () => {
    fixtures.runOverride = {
      finished_at: '2026-09-04T08:08:00.000Z',
      trace: {
        trigger: 'manual',
        triggeredByName: 'Louis Schlegel',
        approvedByName: 'Maëlle Rey',
        approvedAt: '2026-09-04T08:08:00.000Z',
        accountName: 'Nordia',
      },
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    const line = await screen.findByText(/Déclenchée par Louis Schlegel/)
    expect(line.textContent).toContain('validée par Maëlle Rey')
    expect(line.textContent).toContain('depuis Nordia')
  })

  /**
   * ⚠️ LA RÈGLE. Une trace à trous se lit ; une trace remplie de noms inventés
   * ne se lit plus. Sans nom, on dit ce qu'on sait — le déclencheur.
   */
  it('ne remplit RIEN quand les noms ne sont pas lisibles', async () => {
    fixtures.runOverride = {
      trace: {
        // Un déclencheur RÉEL du contrat — la première version de ce test en
        // citait un (`schedule`) qui n'existe dans aucun déclencheur.
        trigger: 'account_dormant',
        triggeredByName: null,
        approvedByName: null,
        approvedAt: null,
        accountName: null,
      },
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    expect(await screen.findByText('Déclenchée par un compte devenu dormant')).toBeInTheDocument()
    expect(screen.queryByText(/validée par/)).toBeNull()
    expect(screen.queryByText(/depuis /)).toBeNull()
  })

  /**
   * ⚠️ Un onglet resté ouvert pendant un déploiement lit une API qui n'envoie
   * pas encore ce champ. Un champ qui change de forme ne dégrade pas : il rend
   * `undefined`, et l'écran entier tombe. Il est déjà arrivé le 05/09.
   */
  it('survit à une API qui n’envoie pas encore la trace', async () => {
    fixtures.runOverride = { trace: undefined }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    // `trigger: 'manual'` reste lisible sur le run lui-même.
    expect(await screen.findByText('Déclenchée à la main')).toBeInTheDocument()
  })

  /**
   * #2200.20 / #2201.40 — LA PREUVE : l'identifiant externe existe par pas
   * depuis l'origine (`workflowRunStepSchema.externalRef`, `action-os.ts:471`)
   * sans AUCUN appelant d'affichage — seule la date de fin apparaissait.
   *
   * #2201.44 — et ce n'est un LIEN que quand c'en est vraiment un (même règle
   * que `CopilotCards` #1952.10) : une clé CRM interne reste du texte.
   */
  it('affiche la référence externe d’un pas, comme TEXTE quand ce n’est pas une URL', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'upsert_record',
          intentType: 'create_crm_task',
          outcome: 'done',
          attempts: 1,
          externalRef: 'hs-4821',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    expect(await screen.findByText(/hs-4821/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ouvrir/ })).not.toBeInTheDocument()
  })

  it('rend la référence externe d’un pas comme un LIEN cliquable quand c’est une URL', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'upsert_record',
          intentType: 'create_crm_task',
          outcome: 'done',
          attempts: 1,
          externalRef: 'https://crm.example.com/records/42',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    const link = await screen.findByRole('link', { name: /Ouvrir/ })
    expect(link).toHaveAttribute('href', 'https://crm.example.com/records/42')
  })

  /**
   * #2201.43 — le CATALOGUE capacité→libellé existait déjà pour le bandeau
   * d'accès (« ton CRM »), sans aucun appelant sur une trace de run
   * GÉNÉRIQUE. La capacité voyage désormais de la définition du workflow
   * jusqu'ici — seulement sur le pas qui porte aussi la PREUVE externe
   * (`externalRef`) : nommer une capacité sans preuve annoncerait un outil
   * non réellement joint.
   */
  it('nomme la capacité du pas qui porte la preuve externe, jamais l’éditeur', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'upsert_record',
          intentType: 'create_crm_task',
          capability: 'crm',
          outcome: 'done',
          attempts: 1,
          externalRef: 'hs-42',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    expect(await screen.findByText(/via ton CRM/)).toBeInTheDocument()
  })

  it('ne nomme rien quand la capacité du pas n’est pas dans le catalogue — absence ≠ invention', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'enrich_decision_maker',
          intentType: 'enrich_contact',
          capability: 'prospection',
          outcome: 'done',
          attempts: 1,
          externalRef: 'apollo-1',
          creditsSpent: 0,
          reason: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    await screen.findByText(/apollo-1/)
    expect(screen.queryByText(/^via /)).not.toBeInTheDocument()
  })

  it('ne nomme AUCUNE capacité sans preuve externe sur ce pas — la capacité REQUISE n’est pas la capacité ATTEINTE', async () => {
    fixtures.runOverride = {
      steps: [
        {
          key: 'schedule_decision',
          intentType: 'schedule_reminder',
          capability: 'calendar',
          outcome: 'done',
          attempts: 1,
          externalRef: null,
          creditsSpent: 0,
          reason: 'Rappel interne enregistré (aucun agenda connecté).',
          startedAt: null,
          finishedAt: null,
        },
      ],
    }
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: /À reprendre/ }))

    await screen.findByText(/Déclenchée à la main/)
    expect(screen.queryByText(/via ton agenda/)).not.toBeInTheDocument()
  })
})

/**
 * #1498 — « ANCIENNE VALEUR → NOUVELLE VALEUR », ET « MODIFIER ».
 *
 * Deux décisions de Louis du 05/09. La seconde a l'air de heurter la règle qui
 * rend cette file sûre — *la prévisualisation est FIGÉE, on approuve exactement
 * ce qu'on a lu* — et c'est pour ça que « modifier » ne modifie RIEN en place :
 * il crée une demande neuve, gelée à son tour.
 */
describe('le diff, et la correction avant validation', () => {
  const withPrevious = {
    id: 'cw-9',
    kind: 'create_note' as const,
    preview: [{ field: 'Note', key: 'note', value: 'RDV fixé au 20/09', previous: 'Appel du 12/08' }],
    origin: 'system' as const,
    createdAt: '2026-09-02T10:00:00.000Z',
    expiresAt: '2026-09-05T10:00:00.000Z',
    requestedByYou: false,
  }

  it('montre l’ancienne valeur À CÔTÉ de la nouvelle', async () => {
    fixtures.crmRequests = [withPrevious]
    renderCenter()

    expect(await screen.findByText('Appel du 12/08')).toBeInTheDocument()
    expect(screen.getByText(/RDV fixé au 20\/09/)).toBeInTheDocument()
  })

  /**
   * ⚠️ `previous` absent = on ne SAIT pas, et ce n'est pas « vide ». L'écran
   * écrit alors la nouvelle valeur seule — jamais « non renseigné → … », qui
   * affirmerait que le champ était vide.
   */
  it('n’invente aucune ancienne valeur quand elle est inconnue', async () => {
    fixtures.crmRequests = [{ ...withPrevious, preview: [{ field: 'Note', key: 'note', value: 'Nouvelle note' }] }]
    renderCenter()

    expect(await screen.findByText(/Nouvelle note/)).toBeInTheDocument()
    expect(screen.queryByText('→')).toBeNull()
  })

  it('corrige une valeur et envoie une RÉVISION, pas une approbation', async () => {
    fixtures.crmRequests = [withPrevious]
    const user = userEvent.setup()
    renderCenter()

    await user.click(await screen.findByRole('button', { name: 'Modifier' }))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'RDV fixé au 21/09')
    await user.click(screen.getByRole('button', { name: /Enregistrer et remplacer/ }))

    expect(fixtures.reviseCrm).toHaveBeenCalledWith({ id: 'cw-9', changes: { note: 'RDV fixé au 21/09' } })
    // ⚠️ Corriger n'approuve pas : la demande neuve devra être validée à son tour.
    expect(fixtures.decideCrm).not.toHaveBeenCalled()
  })

  /**
   * Une demande créée avant que les clés existent se relit très bien — elle ne
   * se révise simplement pas. Proposer « Modifier » dessus donnerait un bouton
   * qui ne peut rien renvoyer.
   */
  it('ne propose PAS « Modifier » sur une demande sans clés', async () => {
    fixtures.crmRequests = [{ ...withPrevious, preview: [{ field: 'Note', value: 'Ancienne demande' }] }]
    renderCenter()

    await screen.findByText(/Ancienne demande/)
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  })
})

/**
 * #1959.18 — LA CLÉ D'IDEMPOTENCE EST CELLE DU GESTE, PAS CELLE DU RENDU.
 *
 * Le bouton tirait `crypto.randomUUID()` à chaque MONTAGE : lancer, rafraîchir
 * pendant que ça tourne, relancer donnait deux runs là où l'utilisateur n'avait
 * fait qu'un geste. Ces deux tests sont l'un l'inverse de l'autre — ni une clé
 * aléatoire ni une clé gelée pour toujours ne les passent tous les deux.
 */
describe('Centre d’actions — la clé d’idempotence du lancement', () => {
  async function launch() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Automatisations/ }))
    await user.click(await screen.findByRole('button', { name: 'Lancer' }))
    return user
  }

  /** ⚠️ La clé est LUE, jamais supposée : comparer deux `undefined` donnerait un
   *  test vert alors qu'aucune clé ne part — exactement le défaut qu'on corrige. */
  const keyOf = (call: number): string => {
    const key = (fixtures.start.mock.calls[call]?.[0] as { idempotencyKey?: string } | undefined)?.idempotencyKey
    expect(typeof key).toBe('string')
    return key as string
  }

  it('le même lancement rejoué après un remontage porte la MÊME clé — un seul run', async () => {
    // Casse si la clé redevient tirée par montage.
    const first = renderCenter()
    await launch()
    first.unmount()

    renderCenter()
    await launch()

    expect(fixtures.start).toHaveBeenCalledTimes(2)
    expect(keyOf(1)).toBe(keyOf(0))
  })

  it('une fois l’issue du lancement CONNUE, un nouveau clic porte une clé NEUVE', async () => {
    // Casse si la clé est simplement dérivée de la motion : le deuxième
    // lancement — voulu, après avoir vu le résultat du premier — serait
    // dédoublonné contre lui et ne partirait jamais.
    fixtures.start.mockResolvedValue({
      run: { status: 'done' },
      plan: { executableNow: [], blocked: [] },
      reused: false,
    })
    renderCenter()
    const user = await launch()
    await waitFor(() => expect(fixtures.start).toHaveBeenCalledTimes(1))
    await user.click(await screen.findByRole('button', { name: 'Lancer' }))

    await waitFor(() => expect(fixtures.start).toHaveBeenCalledTimes(2))
    expect(keyOf(1)).not.toBe(keyOf(0))
  })
})

/**
 * #2717 — un clic ailleurs dans le produit (tuile « En retard » du Dashboard)
 * doit ouvrir DIRECTEMENT le bon onglet, filtré — pas « À valider » suivi d'un
 * second clic manuel.
 */
describe('#2717 — initialTab et overdueOnly, la destination exacte d’un clic externe', () => {
  it('`initialTab="mine"` ouvre « Mes relances » sans clic supplémentaire', async () => {
    renderCenter({ initialTab: 'mine' })
    expect(await screen.findByText('Cette tâche sera uniquement marquée terminée.')).toBeInTheDocument()
  })

  it('sans `initialTab`, l’écran ouvre toujours sur « À valider » (comportement inchangé)', async () => {
    renderCenter()
    expect(await screen.findByText(/Envoyer le récapitulatif — Claire Dubois/)).toBeInTheDocument()
  })

  it('`overdueOnly` est transmis à `useMyActions`, pour filtrer la MÊME portée que le comptage du cockpit', async () => {
    renderCenter({ initialTab: 'mine', overdueOnly: true })
    await screen.findByText('Cette tâche sera uniquement marquée terminée.')
    expect(useMyActionsSpy).toHaveBeenCalledWith(true)
  })
})

/**
 * #2200.39 / #2200.42 / #2200.43 (épopée #2867) — LES FILTRES RISQUE / AGENT /
 * SOURCE DE LA FILE « À VALIDER ».
 *
 * Contrôlé depuis l'extérieur (`filters`/`onFiltersChange`) : le composant ne
 * garde aucun état de filtre à lui, pour que le retour navigateur (l'URL,
 * câblée par `ActionHistoryPage`) reste la seule source de vérité.
 */
describe('#2867 — filtres Risque/Agent/Source sur « À valider »', () => {
  it('une pastille par valeur RÉELLEMENT présente — jamais l’énumération complète du contrat', async () => {
    fixtures.approvals = [{ ...DEFAULT_APPROVAL, risk: 'medium' }]
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    // Une seule valeur de risque existe dans la file : sa pastille apparaît…
    expect(screen.getByRole('button', { name: /Modéré/ })).toBeInTheDocument()
    // …celles qu'aucune carte ne porte n'apparaissent pas (doctrine : on
    // n'affiche pas ce qu'on n'a pas).
    expect(screen.queryByRole('button', { name: /Élevé/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Irréversible/ })).not.toBeInTheDocument()
  })

  it('clique une pastille de risque : prévient le parent, ne filtre rien lui-même', async () => {
    fixtures.approvals = [{ ...DEFAULT_APPROVAL, risk: 'medium' }]
    const onFiltersChange = vi.fn()
    const user = userEvent.setup()
    renderCenter({ onFiltersChange })
    await user.click(await screen.findByRole('button', { name: /Modéré/ }))
    expect(onFiltersChange).toHaveBeenCalledWith({ risk: 'medium' })
    // Non contrôlé en retour : la carte reste visible tant que le parent ne
    // renvoie pas le nouveau `filters` — c'est l'URL qui décide, pas l'écran.
    expect(screen.getByText(/Envoyer le récapitulatif/)).toBeInTheDocument()
  })

  it('un filtre CONTRÔLÉ retire les cartes qui ne correspondent pas', async () => {
    fixtures.approvals = [
      { ...DEFAULT_APPROVAL, risk: 'medium' },
      { ...DEFAULT_APPROVAL, id: 'ap-2', summary: 'Créer la fiche — Julien Dupuis (BETA)', risk: 'high' },
    ]
    renderCenter({ filters: { risk: 'high' } })
    expect(await screen.findByText(/Créer la fiche — Julien Dupuis/)).toBeInTheDocument()
    expect(screen.queryByText(/Envoyer le récapitulatif/)).not.toBeInTheDocument()
  })

  it('un filtre qui ne correspond à AUCUNE carte le dit — jamais confondu avec « rien à valider »', async () => {
    fixtures.approvals = [{ ...DEFAULT_APPROVAL, risk: 'medium' }]
    renderCenter({ filters: { risk: 'high' } })
    expect(await screen.findByText('Aucune demande ne correspond à ces filtres.')).toBeInTheDocument()
    expect(screen.queryByText(/Envoyer le récapitulatif/)).not.toBeInTheDocument()
  })

  it('le filtre Agent distingue un déclenchement humain d’une automatisation, toutes familles confondues', async () => {
    fixtures.approvals = [{ ...DEFAULT_APPROVAL, trace: { ...DEFAULT_APPROVAL.trace, triggeredByName: null } }]
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    expect(screen.getByRole('button', { name: /^Automatisation$/ })).toBeInTheDocument()
    // Aucune carte n'est déclenchée par un humain ici : pas de pastille « Humain ».
    expect(screen.queryByRole('button', { name: /^Humain$/ })).not.toBeInTheDocument()
  })

  it('sans aucune donnée mesurée (file vide), la barre de filtres ne s’affiche pas', async () => {
    fixtures.approvals = []
    renderCenter()
    await screen.findByText(/Rien à valider/i)
    expect(screen.queryByRole('group', { name: /[Rr]isque/ })).not.toBeInTheDocument()
  })
})

// #2864 / #2856 — le CIRCUIT d'une demande : la confier, la reporter. Le
// contenu de la demande (résumé figé, boutons Approuver/Refuser) ne change pas.
describe('Centre d’actions — confier et reporter une demande (#2864 / #2856)', () => {
  const FUTURE = new Date(Date.now() + 3 * 24 * 3600_000 - 60_000).toISOString()

  it('confie la demande à un collègue de l’espace', async () => {
    const user = userEvent.setup()
    fixtures.members = [
      { userId: 'u1', email: 'moi@esn.fr', fullName: 'Moi', role: 'sales', isSelf: true },
      { userId: 'u2', email: 'claire@esn.fr', fullName: 'Claire Martin', role: 'sales', isSelf: false },
    ]
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    await user.click(screen.getByRole('combobox', { name: /Confier/ }))
    await user.click(await screen.findByRole('option', { name: 'Claire Martin' }))
    await waitFor(() => expect(fixtures.assign).toHaveBeenCalledWith('ap-1', 'u2'))
  })

  it('ne répète plus « aucun collègue » sur chaque carte : il se dit UNE fois, quand on essaie de confier (L-A)', async () => {
    const user = userEvent.setup()
    fixtures.members = [{ userId: 'u1', email: 'moi@esn.fr', fullName: 'Moi', role: 'sales', isSelf: true }]
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    expect(screen.queryByRole('combobox', { name: /Confier/ })).not.toBeInTheDocument()
    // rien d'écrit sur la carte tant qu'on n'essaie pas
    expect(screen.queryByText(/Aucun collègue/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confier' }))
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Aucun collègue/), { id: 'routing-no-colleague' })
  })

  it('signale une demande confiée à l’utilisateur', async () => {
    fixtures.approvals = [{ ...DEFAULT_APPROVAL, assigned_to: 'u1' }]
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    expect(screen.getByText(/Confiée à toi/)).toBeInTheDocument()
  })

  it('reporte à demain — sans rien approuver', async () => {
    const user = userEvent.setup()
    // `decide` vit hors des fixtures : un test précédent a pu cliquer « Approuver ».
    decide.mockClear()
    fixtures.approvals = [{ ...DEFAULT_APPROVAL, expires_at: FUTURE }]
    renderCenter()
    await screen.findByText(/Envoyer le récapitulatif/)
    await user.click(screen.getByRole('button', { name: /Reporter à demain/ }))
    await waitFor(() => expect(fixtures.snooze).toHaveBeenCalledWith('ap-1', expect.any(String)))
    expect(decide).not.toHaveBeenCalled()
  })

  it('une demande reportée sort de la file active, reste nommée, et se réveille', async () => {
    const user = userEvent.setup()
    fixtures.approvals = [
      { ...DEFAULT_APPROVAL, expires_at: FUTURE, snoozed_until: new Date(Date.now() + 3600_000).toISOString() },
    ]
    renderCenter()
    const section = await screen.findByRole('region', { name: /Reportées/ })
    expect(within(section).getByText(/Envoyer le récapitulatif/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Approuver/ })).not.toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: /Réveiller/ }))
    await waitFor(() => expect(fixtures.snooze).toHaveBeenCalledWith('ap-1', null))
  })
})

/**
 * Lot L-A (#4164) — le MODE TIROIR : l'onglet est imposé par le tiroir « Historique » de la page
 * « Aujourd'hui », qui porte ses propres onglets. Plus de titre ni de pastilles ici, et jamais la
 * file où l'on agit (elle est « Aujourd'hui »).
 */
describe('Centre d’actions — mode tiroir « Historique » (L-A)', () => {
  it('rend la vue imposée, sans titre ni pastilles, et sans la file « À valider »', async () => {
    renderCenter({ historyTab: 'failed' })
    // #4463 — l'onglet imposé est rendu, sans aucune ligne de coût.
    expect(await screen.findByText(/CRM indisponible/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit|Coût annoncé/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /À valider/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Envoyer le récapitulatif/)).not.toBeInTheDocument()
  })

  it('« reportées » liste les demandes reportées et les réveille', async () => {
    const user = userEvent.setup()
    fixtures.approvals = [{ ...DEFAULT_APPROVAL, snoozed_until: new Date(Date.now() + 3600_000).toISOString() }]
    renderCenter({ historyTab: 'snoozed' })
    const section = await screen.findByRole('region', { name: /Reportées/ })
    await user.click(within(section).getByRole('button', { name: /Réveiller/ }))
    await waitFor(() => expect(fixtures.snooze).toHaveBeenCalledWith('ap-1', null))
  })

  it('« reportées » sans rien de reporté le dit, au lieu d’un écran vide', async () => {
    fixtures.approvals = []
    renderCenter({ historyTab: 'snoozed' })
    expect(await screen.findByText('Aucune demande reportée.')).toBeInTheDocument()
  })
})
