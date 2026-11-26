import type { RoutineView } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2153.41 / #2153.43 / #2153.47 — LES DOUZE ATTRIBUTS D'UNE AUTOMATISATION,
 * ET CE QUI N'ATTEIGNAIT AUCUN ÉCRAN.
 *
 * `routineDefinitionSchema` (`packages/contracts/src/schemas/routines.ts`) porte
 * `condition` (attribut 3), `acceptance` (attribut 12) et `fallback`
 * (attribut 10) depuis leur ajout — le service les ENVOIE déjà au client
 * (`routines.service.ts`). Mais `RoutinesView` ne les a jamais rendus : elle
 * n'affichait que `name`, `cadence`, `description`, `outcome`. Une routine
 * qu'on active sans savoir CE QUI DOIT ÊTRE VRAI pour qu'elle produise
 * quelque chose, COMMENT on prouve qu'elle marche, et ce qu'elle fait quand
 * elle échoue, c'est exactement « une automatisation qui ne renseigne pas ses
 * douze attributs n'est pas spécifiée » — vu de l'écran, pas du contrat.
 *
 * #2205.16/.17, #2205.18/.19/.28/.30/.58/.60, #2205.21/.37, #2205.26/.55 —
 * LA CARTE DIT CE QU'ELLE CHANGE.
 *
 * Le registre du 16/09 constate que `RoutineDefinition` porte déjà le
 * déclencheur (`condition`) et le niveau d'autonomie (`automationLevel`)
 * depuis le catalogue, et que `subscription.channel` est déjà patchable côté
 * API — mais que `RoutinesView.tsx` ne rendait AUCUN des trois. Une carte qui
 * ne montre ni pourquoi une routine se déclenche, ni ce qu'elle a le droit de
 * faire, ni par où passe la notification, n'est pas « visible et
 * compréhensible » — c'est une case à cocher opaque.
 *
 * Les deux lots visaient en partie le MÊME champ (`condition`, appelé
 * « condition » d'un côté et « déclencheur » de l'autre) : l'écran ne le
 * rend qu'UNE fois (GA-26), les deux suites de tests ci-dessous se contentent
 * donc de vérifier que la valeur interpolée apparaît, jamais le gabarit
 * autour.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
  }) => {
    const path = Object.entries(params ?? {}).reduce((acc, [key, value]) => acc.replace(`$${key}`, value), to)
    const query = new URLSearchParams(search).toString()
    return <a href={query === '' ? path : `${path}?${query}`}>{children}</a>
  },
}))

vi.mock('@/features/action-os/view/ApprovalSettingsCard', () => ({ ApprovalSettingsCard: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))

const routines = vi.fn()
const updateMutate = vi.fn()
const runDueRoutines = vi.fn()
const routineRuns = vi.fn()
const noReplyFollowUpDryRun = vi.fn()
vi.mock('../api', () => ({
  useRoutines: () => routines(),
  useRunDueRoutines: () => runDueRoutines(),
  useUpdateRoutine: () => ({ mutate: updateMutate, isPending: false }),
  useRoutineRuns: (key: string, enabled: boolean) => routineRuns(key, enabled),
  useNoReplyFollowUpDryRun: (enabled: boolean) => noReplyFollowUpDryRun(enabled),
}))

const { RoutineFunctioningDialog } = await import('./RoutineFunctioningDialog')

/**
 * Théo C automations-bibliotheque.R2 — la fiche d'une routine est une FENÊTRE (« Voir le fonctionnement »), à deux
 * onglets. Ce fichier est l'ancien test de la liste des Réglages, porté tel quel : chaque promesse de l'ancienne carte
 * (douze attributs, historique et preuve, simulation, plafond, porte d'activation…) doit survivre au rangement.
 */
function Harness({ tab = 'how' }: { tab?: 'how' | 'settings' }) {
  const { data } = routines() as { data: RoutineView[] }
  const first = data[0]
  return first ? <RoutineFunctioningDialog view={first} open onOpenChange={() => {}} initialTab={tab} /> : null
}

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => {
  updateMutate.mockClear()
  runDueRoutines.mockReturnValue({ isPending: false, mutate: vi.fn(), data: undefined })
  routineRuns.mockReturnValue({ data: undefined, isLoading: false })
  noReplyFollowUpDryRun.mockReturnValue({ data: undefined, isLoading: false, isError: false })
})

function view(over: Partial<RoutineView['definition']> = {}, viewOver: Partial<RoutineView> = {}): RoutineView {
  return {
    definition: {
      key: 'daily_briefing',
      name: { fr: 'Brief du matin', en: 'Morning briefing' },
      description: { fr: 'Un résumé chaque matin.', en: 'A summary every morning.' },
      outcome: { fr: 'Un email envoyé.', en: 'An email sent.' },
      cadence: 'daily',
      defaultHour: 8,
      defaultWeekday: null,
      requires: ['mailbox_read'],
      defaultChannel: 'email',
      automationLevel: 'n1_prepare',
      condition: { fr: 'Un message est arrivé depuis hier.', en: 'A message arrived since yesterday.' },
      reads: { fr: 'La messagerie.', en: 'The mailbox.' },
      fallback: { fr: 'Elle se tait et le dit.', en: 'It stays silent and says so.' },
      acceptance: { fr: 'Un email reçu le matin.', en: 'An email received in the morning.' },
      defaultEnabled: true,
      example: null,
      stopCondition: null,
      version: 1,
      roles: ['general'],
      workspaceProfiles: ['staffing', 'forfait_conseil'],
      scope: 'personal',
      steps: ['read', 'notify'],
      preparedActions: ['notification'],
      validations: ['review_before_acting'],
      budget: 'no_model_call',
      ...over,
    },
    subscription: {
      key: 'daily_briefing',
      status: 'active',
      enabled: true,
      hour: 8,
      weekday: null,
      channel: 'email',
      timeZone: 'Europe/Paris',
      maxItemsPerRun: null,
      autonomy: null,
      ownerUserId: null,
    },
    blockers: [],
    lastRunAt: null,
    lastOutcome: null,
    nextTriggerAt: null,
    updated: false,
    ...viewOver,
  } as RoutineView
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

describe('la fiche de routine nomme ses douze attributs', () => {
  it('affiche la condition, le critère de validation et le repli — pas seulement le nom et la cadence', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })

    render(<Harness />)
    const container = document.body

    expect(container.textContent).toContain('Un message est arrivé depuis hier.')
    expect(container.textContent).toContain('Un email reçu le matin.')
    expect(container.textContent).toContain('Elle se tait et le dit.')
  })

  /**
   * #2399.3 — `reads` (attribut 4, « ce qu'elle LIT ») est ENVOYÉ par le
   * service et déjà présent dans la fixture de ce fichier (ligne `reads:`
   * ci-dessus) depuis les lots #2153/#2205, mais `RoutinesView` ne l'a jamais
   * rendu — même défaut que `condition`/`acceptance`/`fallback` avant eux : du
   * code juste, calculé, testé, que personne n'appelle depuis l'écran.
   */
  it('#2399.3 — montre ce que la routine LIT, écrit au catalogue mais jamais rendu', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })

    render(<Harness />)
    const container = document.body

    expect(container.textContent).toContain('La messagerie.')
  })

  /**
   * #2399.3 — l'EXEMPLE (attribut 16), déjà envoyé par le catalogue depuis le
   * lot #2399.3 précédent (`example`/`version` ajoutés au schéma) mais jamais
   * rendu — même défaut que `reads` juste au-dessus.
   */
  it('#2399.3 — montre un EXEMPLE quand le catalogue en porte un', () => {
    routines.mockReturnValue({
      data: [view({ example: { fr: 'Mardi 8h30 : deux rendez-vous à préparer.', en: 'Tuesday 8:30 AM.' } })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)

    expect(screen.getByText(/Mardi 8h30 : deux rendez-vous à préparer\./)).toBeInTheDocument()
  })

  it("#2399.3 — n'affiche AUCUNE ligne d'exemple quand le catalogue n'en porte pas (GA-18/GA-19)", () => {
    routines.mockReturnValue({ data: [view({ example: null })], isLoading: false, isError: false, refetch: vi.fn() })

    render(<Harness />)

    expect(screen.queryByText(/^Exemple ?:/)).not.toBeInTheDocument()
  })

  /**
   * #2398.6/#2398.14 (épopée #2843) — LA CONDITION D'ARRÊT, envoyée par le
   * catalogue depuis son ajout au schéma mais jamais rendue — même défaut
   * que l'exemple juste au-dessus.
   */
  it("#2398.6/#2398.14 — montre la CONDITION D'ARRÊT quand le catalogue en porte une", () => {
    routines.mockReturnValue({
      data: [
        view({ stopCondition: { fr: 'Elle s’arrête quand le contact répond.', en: 'It stops when he replies.' } }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)

    expect(screen.getByText(/Elle s’arrête quand le contact répond\./)).toBeInTheDocument()
  })

  it("#2398.6/#2398.14 — n'affiche AUCUNE ligne de condition d'arrêt quand le catalogue n'en porte pas (GA-18/GA-19)", () => {
    routines.mockReturnValue({
      data: [view({ stopCondition: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)

    expect(screen.queryByText(/^S'arrête quand ?:/)).not.toBeInTheDocument()
  })

  /** #2399.6 — le compteur de VERSION (fondation du versioning), jamais rendu. */
  it('#2399.6 — montre le numéro de VERSION de la fiche', () => {
    routines.mockReturnValue({ data: [view({ version: 3 })], isLoading: false, isError: false, refetch: vi.fn() })

    render(<Harness />)

    expect(screen.getByText('Version 3')).toBeInTheDocument()
  })

  /**
   * #2916 (#2399.6/.7) — LE DÉCLENCHEUR du versioning, enfin visible : une
   * routine dont `seen_version` (base) est en retard sur `definition.version`
   * (catalogue) le DIT à l'écran, elle ne le laisse plus deviner d'un entier
   * que personne ne lit.
   */
  it('#2399.6/.7 — signale une routine mise à jour depuis la dernière visite', () => {
    routines.mockReturnValue({
      data: [view({}, { updated: true })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)

    expect(screen.getByText('Mise à jour disponible')).toBeInTheDocument()
  })

  it("#2916 (#2399.6/.7) — n'affiche AUCUN signal de mise à jour quand la routine est déjà à jour", () => {
    routines.mockReturnValue({
      data: [view({}, { updated: false })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)

    expect(screen.queryByText('Mise à jour disponible')).not.toBeInTheDocument()
  })

  it('#2399.7 — une routine mise à jour dit ce qui change et ce que devient la configuration', () => {
    routines.mockReturnValue({
      data: [
        view(
          { version: 2 },
          {
            updated: true,
            versionNotes: [
              {
                version: 2,
                changes: { fr: 'Le plafond de destinataires est réglable.', en: 'The recipient cap is adjustable.' },
                migration: { fr: 'Ta configuration est conservée.', en: 'Your configuration is kept.' },
              },
            ],
          },
        ),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)

    expect(screen.getByText('Le plafond de destinataires est réglable.')).toBeInTheDocument()
    expect(screen.getByText('Ta configuration est conservée.')).toBeInTheDocument()
  })

  // #2916.7 — un DIFF par champ modifié : ancienne ↔ nouvelle valeur ; jamais renseigné = « non renseignée », jamais 0.
  it('#2916.7 — la note montre ancienne et nouvelle valeur par champ, « non renseignée » sans valeur avant', () => {
    routines.mockReturnValue({
      data: [
        view(
          { version: 2 },
          {
            updated: true,
            versionNotes: [
              {
                version: 2,
                changes: { fr: 'La fiche nomme sa condition d’arrêt.', en: 'The card names its stop condition.' },
                migration: { fr: 'Rien à refaire.', en: 'Nothing to redo.' },
                fieldChanges: [
                  {
                    field: 'stopCondition',
                    before: null,
                    after: { fr: 'le brief du jour est livré', en: 'the daily brief is delivered' },
                  },
                  {
                    field: 'maxItemsPerRun',
                    before: { fr: 'Un seul brouillon par passage', en: 'A single draft per run' },
                    after: { fr: 'De 1 à 5 relances par passage', en: 'From 1 to 5 follow-ups per run' },
                  },
                ],
              },
            ],
          },
        ),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)

    const stop = screen.getByTestId('routine-field-change-stopCondition')
    expect(stop).toHaveTextContent('non renseignée')
    expect(stop).toHaveTextContent('le brief du jour est livré')
    expect(stop).not.toHaveTextContent('0')
    const items = screen.getByTestId('routine-field-change-maxItemsPerRun')
    expect(items).toHaveTextContent('Un seul brouillon par passage')
    expect(items).toHaveTextContent('De 1 à 5 relances par passage')
  })

  it("#2399.7 — sans mise à jour, aucune note de version n'est rendue", () => {
    routines.mockReturnValue({
      data: [view({}, { updated: false })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)

    expect(screen.queryByText('Ta configuration est conservée.')).not.toBeInTheDocument()
  })

  it('#2916 (#2399.6/.7) — « Marquer comme vue » acquitte la version courante', async () => {
    const u = user()
    routines.mockReturnValue({
      data: [view({}, { updated: true })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(<Harness />)
    await u.click(screen.getByRole('button', { name: 'Marquer comme vue' }))

    expect(updateMutate).toHaveBeenCalledWith({ key: 'daily_briefing', patch: { acknowledgeVersion: true } })
  })
})

describe('Fenêtre « Voir le fonctionnement » — la carte dit ce qu’elle change', () => {
  it('#2205.16/.17 — montre le DÉCLENCHEUR, écrit au catalogue mais jamais rendu', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness />)

    expect(screen.getByText(/Un message est arrivé depuis hier/)).toBeInTheDocument()
  })

  it('#2205.18/.19/.28/.30/.58/.60 — montre le NIVEAU D’AUTONOMIE de chaque routine', () => {
    routines.mockReturnValue({
      data: [view({ key: 'daily_briefing', automationLevel: 'n1_prepare' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    const { rerender } = render(<Harness />)
    expect(screen.getByText('Prépare')).toBeInTheDocument()

    routines.mockReturnValue({
      data: [view({ key: 'invoice_watch', automationLevel: 'n4_bounded_auto' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    rerender(<Harness />)
    expect(screen.getByText('Notifie sans envoyer')).toBeInTheDocument()
  })

  // #2896 / #2449.37 — le NIVEAU D'ACTION (les quatre niveaux de Laura) visible
  // dans les automatisations, dérivé du niveau N du catalogue — jamais saisi deux fois.
  it('#2449.37 — montre le NIVEAU D’ACTION de chaque routine', () => {
    routines.mockReturnValue({
      data: [view({ key: 'daily_briefing', automationLevel: 'n1_prepare' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    const { rerender } = render(<Harness />)
    expect(screen.getByText("Niveau d'action : Préparer")).toBeInTheDocument()

    routines.mockReturnValue({
      data: [view({ key: 'invoice_watch', automationLevel: 'n4_bounded_auto' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    rerender(<Harness />)
    expect(screen.getByText("Niveau d'action : Automatiser")).toBeInTheDocument()
    expect(screen.queryByText(/Niveau d'action : (Exécuter|Répondre)/)).toBeNull()
  })

  it('#2205.21/.37 — le CANAL se règle depuis la carte, pas seulement en base', async () => {
    const u = user()
    routines.mockReturnValue({
      data: [view({}, { subscription: { ...view().subscription, channel: 'in_app' } })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    // Le canal courant (in_app) est visible avant tout clic.
    expect(screen.getByText('Dans l’application')).toBeInTheDocument()

    const triggers = screen.getAllByRole('combobox')
    const channelTrigger = triggers[triggers.length - 1]
    await u.click(channelTrigger)
    await u.click(await screen.findByText('Email'))

    expect(updateMutate).toHaveBeenCalledWith({ key: 'daily_briefing', patch: { channel: 'email' } })
  })

  it('#2205.26/.55 — un ÉCHEC se distingue visuellement d’un résultat normal', () => {
    routines.mockReturnValue({
      data: [view({}, { lastRunAt: '2026-09-20T08:00:00.000Z', lastOutcome: 'Échec : Graph 503', lastFailed: true })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    expect(screen.getByText('Échec')).toBeInTheDocument()
  })

  it('un résultat normal ne porte AUCUN badge d’échec', () => {
    routines.mockReturnValue({
      data: [
        view({}, { lastRunAt: '2026-09-20T08:00:00.000Z', lastOutcome: '3 fils sans réponse', lastFailed: false }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    expect(screen.queryByText('Échec')).not.toBeInTheDocument()
  })
})

// #2266.27 — le prochain déclenchement, connu et affiché.
describe('le prochain déclenchement', () => {
  it('affiche la prochaine occurrence quand elle est connue', () => {
    routines.mockReturnValue({
      data: [view({}, { nextTriggerAt: '2026-09-27T06:00:00.000Z' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    expect(screen.getByText(/Prochain déclenchement\s*:/)).toBeInTheDocument()
  })

  it('n’affiche rien quand il n’y a pas de prochain instant à nommer (désactivée, ou cadence continue)', () => {
    routines.mockReturnValue({
      data: [view({}, { nextTriggerAt: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    expect(screen.queryByText(/Prochain déclenchement\s*:/)).not.toBeInTheDocument()
  })
})

// #2205.49-52/.62 — la table `routine_runs` existait déjà mais aucun écran ne
// la lisait au-delà du dernier résultat (`lastOutcome`) : impossible de
// répondre « les routines tournent-elles vraiment, jour après jour ? ».
describe('Fenêtre « Voir le fonctionnement » — l’historique d’une routine', () => {
  it('ne charge PAS l’historique tant que le panneau n’est pas ouvert', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness tab="settings" />)

    expect(routineRuns).toHaveBeenCalledWith('daily_briefing', false)
  })

  it('au clic sur « Voir l’historique », charge et affiche les exécutions passées', async () => {
    const u = user()
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    routineRuns.mockReturnValue({
      data: [
        {
          id: 'run-2',
          createdAt: '2026-09-22T08:00:00.000Z',
          notified: true,
          outcome: '2 fils sans réponse',
          failed: false,
        },
        {
          id: 'run-1',
          createdAt: '2026-09-21T08:00:00.000Z',
          notified: false,
          outcome: 'Échec : Graph 503',
          failed: true,
        },
      ],
      isLoading: false,
    })
    render(<Harness tab="settings" />)

    await u.click(screen.getByRole('button', { name: /historique/i }))

    expect(routineRuns).toHaveBeenCalledWith('daily_briefing', true)
    expect(screen.getByText('2 fils sans réponse')).toBeInTheDocument()
    expect(screen.getByText(/Graph 503/)).toBeInTheDocument()
  })

  it('routine jamais exécutée : dit qu’il n’y a rien, jamais une liste vide muette', async () => {
    const u = user()
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    routineRuns.mockReturnValue({ data: [], isLoading: false })
    render(<Harness tab="settings" />)

    await u.click(screen.getByRole('button', { name: /historique/i }))

    expect(screen.getByText(/Aucune exécution/i)).toBeInTheDocument()
  })

  // #2205.54 — la PREUVE vérifiable, jamais un identifiant brut rendu cliquable.
  it('une exécution avec un lien de preuve rend un bouton « Voir la preuve »', async () => {
    const u = user()
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    routineRuns.mockReturnValue({
      data: [
        {
          id: 'run-3',
          createdAt: '2026-09-23T08:00:00.000Z',
          notified: true,
          outcome: '1 fil(s) sans réponse — une relance préparée.',
          failed: false,
          proofRef: 'https://mail.example/d1',
        },
      ],
      isLoading: false,
    })
    render(<Harness tab="settings" />)

    await u.click(screen.getByRole('button', { name: /historique/i }))

    const proofLink = screen.getByRole('link', { name: /voir la preuve/i })
    expect(proofLink).toHaveAttribute('href', 'https://mail.example/d1')
  })

  it('une exécution sans preuve vérifiable (identifiant seul, pas une URL) ne rend aucun lien', async () => {
    const u = user()
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    routineRuns.mockReturnValue({
      data: [
        {
          id: 'run-4',
          createdAt: '2026-09-23T08:00:00.000Z',
          notified: true,
          outcome: '1 fil(s) sans réponse — une relance préparée.',
          failed: false,
          proofRef: 'd1',
        },
      ],
      isLoading: false,
    })
    render(<Harness tab="settings" />)

    await u.click(screen.getByRole('button', { name: /historique/i }))

    expect(screen.queryByRole('link', { name: /voir la preuve/i })).not.toBeInTheDocument()
  })
})

/**
 * #2398.13/#2205.38 — la simulation, pour la SEULE routine où le calcul de
 * la cible est déjà séparé de l'écriture (`no_reply_follow_up`).
 */
describe('Fenêtre « Voir le fonctionnement » — simulation « no_reply_follow_up » (#2398.13/#2205.38)', () => {
  it('Théo C automations-bibliotheque.R4 — une autre routine propose la simulation GÉNÉRIQUE, lue de sa fiche, sans appel dédié', async () => {
    const u = user()
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness tab="settings" />)

    await u.click(screen.getByRole('button', { name: /simuler/i }))

    expect(screen.getByText(/Elle lirait : La messagerie\./)).toBeInTheDocument()
    expect(screen.getByText(/rien n'est écrit, rien n'est envoyé/)).toBeInTheDocument()
    expect(noReplyFollowUpDryRun).toHaveBeenCalledWith(false)
  })

  it('un prérequis manquant est NOMMÉ dans la simulation — elle ne promet pas ce qui ne tournerait pas', async () => {
    const u = user()
    routines.mockReturnValue({
      data: [view({}, { blockers: ['mailbox_not_connected'] })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    await u.click(screen.getByRole('button', { name: /simuler/i }))

    expect(screen.getAllByText(/Ta messagerie n'est pas connectée/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Tous ses prérequis sont là/)).not.toBeInTheDocument()
  })

  it('ne charge PAS la simulation tant que le panneau n’est pas ouvert', () => {
    routines.mockReturnValue({
      data: [
        view({ key: 'no_reply_follow_up' }, { subscription: { ...view().subscription, key: 'no_reply_follow_up' } }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    expect(noReplyFollowUpDryRun).toHaveBeenCalledWith(false)
  })

  it('au clic sur « Simuler », affiche le résultat SANS jamais écrire ni envoyer', async () => {
    const u = user()
    routines.mockReturnValue({
      data: [
        view({ key: 'no_reply_follow_up' }, { subscription: { ...view().subscription, key: 'no_reply_follow_up' } }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    noReplyFollowUpDryRun.mockReturnValue({
      data: {
        threadsFound: 2,
        oldest: { counterpart: 'client@example.com', daysSinceLastMessage: 9 },
        wouldPrepareDraft: true,
        blockedReason: null,
      },
      isLoading: false,
      isError: false,
    })
    render(<Harness tab="settings" />)

    await u.click(screen.getByRole('button', { name: /simuler/i }))

    expect(noReplyFollowUpDryRun).toHaveBeenCalledWith(true)
    expect(screen.getByText(/2 fil\(s\) sans réponse/)).toBeInTheDocument()
    expect(screen.getByText(/client@example\.com/)).toBeInTheDocument()
  })

  it('aucun fil trouvé : le dit, jamais une case vide muette', async () => {
    const u = user()
    routines.mockReturnValue({
      data: [
        view({ key: 'no_reply_follow_up' }, { subscription: { ...view().subscription, key: 'no_reply_follow_up' } }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    noReplyFollowUpDryRun.mockReturnValue({
      data: { threadsFound: 0, oldest: null, wouldPrepareDraft: false, blockedReason: 'no_thread' },
      isLoading: false,
      isError: false,
    })
    render(<Harness tab="settings" />)

    await u.click(screen.getByRole('button', { name: /simuler/i }))

    expect(screen.getByText(/Aucun fil sans réponse/i)).toBeInTheDocument()
  })
})

/**
 * #2843 (#2205.45) — LE PLAFOND DE DESTINATAIRES, réglable UNIQUEMENT sur
 * `no_reply_follow_up` (même routine, même raison que la simulation ci-dessus).
 */
describe('Fenêtre « Voir le fonctionnement » — plafond de destinataires (#2205.45)', () => {
  it('n’affiche pas le réglage sur une autre routine', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness tab="settings" />)

    expect(screen.queryByLabelText(/relances par passage/i)).not.toBeInTheDocument()
  })

  it('affiche le plafond réglé, patch au changement', async () => {
    const u = user()
    routines.mockReturnValue({
      data: [
        view(
          { key: 'no_reply_follow_up' },
          { subscription: { ...view().subscription, key: 'no_reply_follow_up', maxItemsPerRun: 2 } },
        ),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    const select = screen.getByLabelText(/relances par passage/i)
    expect(select).toHaveTextContent('2')

    await u.click(select)
    await u.click(screen.getByRole('option', { name: '4 par passage' }))

    expect(updateMutate).toHaveBeenCalledWith({ key: 'no_reply_follow_up', patch: { maxItemsPerRun: 4 } })
  })
})

/**
 * #2399.8/#2399.9 — une automatisation BLOQUÉE (connecteur/compte manquant,
 * `view.blockers`) restait activable : l'interrupteur ne dépendait que
 * d'`update.isPending`. On pouvait donc laisser une routine « Activée » qui ne
 * tournera jamais tant que le blocage n'est pas levé — exactement
 * l'automatisation « séduisante mais non exécutable » que #2399.9 interdit.
 */
describe('Fenêtre « Voir le fonctionnement » — NO-GO : une automatisation bloquée ne s’active pas pour rien (#2399.9)', () => {
  it('désactive le sélecteur de statut quand une routine est bloquée', () => {
    routines.mockReturnValue({
      data: [view({}, { blockers: ['mailbox_not_connected'] })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    // Le filtre vit dans la bibliothèque : dans la fenêtre, le statut est le premier `combobox`.
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled()
  })

  it('laisse le sélecteur de statut actif quand rien ne bloque la routine', () => {
    routines.mockReturnValue({ data: [view({}, { blockers: [] })], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness tab="settings" />)

    expect(screen.getAllByRole('combobox')[0]).toBeEnabled()
  })
})

/**
 * #2398.7 — les six statuts : seuls `active`/`paused`/`disabled` sont
 * réglables depuis cet écran (`ROUTINE_SELECTABLE_STATUSES`), et le choix
 * envoie `status`, plus jamais `enabled`.
 */
describe('Fenêtre « Voir le fonctionnement » — #2398.7 le statut à six valeurs remplace l’interrupteur', () => {
  it('affiche le statut courant et envoie `status` (jamais `enabled`) au changement', async () => {
    const u = user()
    routines.mockReturnValue({
      data: [view({}, { subscription: { ...view().subscription, status: 'active' } })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness tab="settings" />)

    const statusTrigger = screen.getAllByRole('combobox')[0]
    expect(statusTrigger.textContent).toContain('Active')

    await u.click(statusTrigger)
    await u.click(await screen.findByText('Désactivée'))

    expect(updateMutate).toHaveBeenCalledWith({ key: 'daily_briefing', patch: { status: 'disabled' } })
  })
})

/**
 * #2916 (#2399.1/.5) — LA BIBLIOTHÈQUE : navigation (lien vers la fiche) et
 * filtre (par cadence), sur les données déjà chargées.
 */
describe('Fenêtre « Voir le fonctionnement » — porte d’activation (#2398.14)', () => {
  const paused = () => view({}, { subscription: { ...view().subscription, status: 'paused', enabled: false } })

  it('choisir « Active » n’écrit RIEN : montre d’abord ce qu’elle lit, son niveau et ce qui l’arrête', async () => {
    const u = user()
    routines.mockReturnValue({ data: [paused()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness tab="settings" />)

    await u.click(screen.getAllByRole('combobox')[0])
    await u.click(await screen.findByRole('option', { name: 'Active' }))

    expect(updateMutate).not.toHaveBeenCalled()
    const gate = screen.getByRole('group', { name: /avant d.activer/i })
    expect(gate).toHaveTextContent('La messagerie.')
    expect(gate).toHaveTextContent('Un message est arrivé depuis hier.')
    expect(gate).toHaveTextContent('Elle se tait et le dit.')
  })

  it('« Activer » confirme : c’est ce geste, et lui seul, qui écrit', async () => {
    const u = user()
    routines.mockReturnValue({ data: [paused()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness tab="settings" />)

    await u.click(screen.getAllByRole('combobox')[0])
    await u.click(await screen.findByRole('option', { name: 'Active' }))
    await u.click(screen.getByRole('button', { name: 'Activer' }))

    expect(updateMutate).toHaveBeenCalledWith({ key: 'daily_briefing', patch: { status: 'active' } })
  })

  it('mettre en pause n’est jamais freiné par une confirmation', async () => {
    const u = user()
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness tab="settings" />)

    await u.click(screen.getAllByRole('combobox')[0])
    await u.click(await screen.findByRole('option', { name: 'En pause' }))

    expect(updateMutate).toHaveBeenCalledWith({ key: 'daily_briefing', patch: { status: 'paused' } })
  })
})

// Théo C automations-bibliotheque.R2 / A2 / A3 / A4 + automations-editeur.A3 — ce que la fenêtre ajoute au rangement.
describe('Fenêtre « Voir le fonctionnement » — la fiche en deux onglets', () => {
  it('R2 — les rubriques de la maquette (Quand · Ce qui est lu · Résultat) puis la preuve et le repli (éditeur A3)', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness />)

    for (const heading of [
      'Quand',
      'Ce qui est lu',
      'Résultat du modèle de départ',
      'Preuve que ça marche',
      'Si elle ne peut pas',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    // `stopCondition: null` → aucune rubrique « Arrêt du suivi » plutôt qu'une ligne « non renseignée » (GA-18/GA-19).
    expect(screen.queryByRole('heading', { name: 'Arrêt du suivi' })).not.toBeInTheDocument()
  })

  it('A3 — le BLOCAGE d’activation vient avant les rubriques, avec le lien qui répare', () => {
    routines.mockReturnValue({
      data: [view({}, { blockers: ['agenda_not_connected'] })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<Harness />)

    const blocked = screen.getByRole('group', { name: 'Activation bloquée' })
    expect(blocked).toHaveTextContent("Ton agenda n'est pas connecté")
    expect(within(blocked).getByRole('link', { name: 'Connecter' })).toHaveAttribute('href', '/integrations')
    const when = screen.getByRole('heading', { name: 'Quand' })
    expect(blocked.compareDocumentPosition(when) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sans blocage, aucun bandeau de blocage', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness />)
    expect(screen.queryByRole('group', { name: 'Activation bloquée' })).not.toBeInTheDocument()
  })

  it('deux onglets nommés ; l’onglet Réglages porte les contrôles, pas l’autre', async () => {
    const u = user()
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness />)

    expect(screen.getByRole('tab', { name: 'Comment ça marche' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)

    await u.click(screen.getByRole('tab', { name: 'Réglages' }))
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
  })

  it('A2/A4 — « Ce que tu valides » est replié et renvoie l’autonomie générale vers Réglages › Laura', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness tab="settings" />)

    const summary = screen.getByText('Ce que tu valides')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('link', { name: 'Réglages › Laura' })).toHaveAttribute('href', '/settings/laura-mode')
    expect(screen.getByText('Aucun envoi ne part sans ton geste, quel que soit ce réglage.')).toBeInTheDocument()
  })

  it('R3 — « Adapter avec Laura » est proposé dans la fenêtre : Laura aide à régler, rien ne s’active seul', () => {
    routines.mockReturnValue({ data: [view()], isLoading: false, isError: false, refetch: vi.fn() })
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Adapter avec Laura' })).toBeInTheDocument()
  })
})
