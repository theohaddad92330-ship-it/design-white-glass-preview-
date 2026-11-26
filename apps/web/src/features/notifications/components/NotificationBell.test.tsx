import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ConsolidatedNotification } from '@bellum/contracts'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { NotificationBell } from './NotificationBell'

/**
 * #2136 — mesuré en production : `GET /notifications/unread-count` a rendu
 * 401 pour un utilisateur connecté qui naviguait normalement, et la cloche
 * affichait « 0 non lu » — silencieusement, via `unread.data?.count ?? 0`.
 * « Zéro non lu » (mesuré) et « je n'ai pas pu compter » (le sondage a
 * échoué) sont deux affirmations opposées : l'utilisateur agit différemment
 * selon laquelle est vraie. Ce fichier verrouille les TROIS lectures
 * possibles de la cloche, à l'endroit où l'utilisateur les voit vraiment.
 */
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const { mockUseNotifications } = vi.hoisted(() => ({ mockUseNotifications: vi.fn() }))
vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useNotifications: (scope?: string) => mockUseNotifications(scope),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

function makeItem(overrides: Partial<ConsolidatedNotification> = {}): ConsolidatedNotification {
  return {
    id: 'n1',
    type: 'system',
    title: 'Titre',
    body: '',
    link: null,
    read_at: null,
    created_at: new Date().toISOString(),
    level: null,
    source: null,
    source_url: null,
    source_kind: null,
    actor_name: null,
    derived: false,
    occurrences: 1,
    ...overrides,
  }
}

function baseHook(overrides: Partial<ReturnType<typeof mockUseNotifications>> = {}) {
  return {
    notifications: [],
    unreadCount: null,
    unreadCountStatus: 'loading' as const,
    isLoading: false,
    markRead: { mutate: vi.fn() },
    markAllRead: { mutate: vi.fn() },
    clearAll: { mutate: vi.fn(), isPending: false },
    ...overrides,
  }
}

describe('NotificationBell — non mesuré n’est jamais 0 (#2136)', () => {
  it('mesuré et non nul : le badge chiffré, et le nom accessible porte le compte', () => {
    mockUseNotifications.mockReturnValue(baseHook({ unreadCount: 3, unreadCountStatus: 'measured' }))
    render(<NotificationBell />)

    expect(screen.getByRole('button', { name: /3 non lues/i })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('mesuré à zéro : un VRAI zéro — aucun badge, aucun indicateur « non mesuré »', () => {
    mockUseNotifications.mockReturnValue(baseHook({ unreadCount: 0, unreadCountStatus: 'measured' }))
    render(<NotificationBell />)

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByTestId('notification-bell-unknown')).not.toBeInTheDocument()
  })

  it('la mesure a ÉCHOUÉ (401) : le nom accessible dit « non mesuré », jamais « 0 non lue »', () => {
    mockUseNotifications.mockReturnValue(baseHook({ unreadCount: null, unreadCountStatus: 'unknown' }))
    render(<NotificationBell />)

    // La régression EXACTE : ne jamais laisser lire « aucune notification non lue ».
    expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /non mesuré/i })).toBeInTheDocument()
    expect(screen.getByTestId('notification-bell-unknown')).toBeInTheDocument()
    // Et surtout pas un zéro fabriqué affiché comme un compte réel.
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('en cours de chargement : ni le compte mesuré, ni « non mesuré » — juste le libellé neutre', () => {
    mockUseNotifications.mockReturnValue(baseHook({ unreadCount: null, unreadCountStatus: 'loading' }))
    render(<NotificationBell />)

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByTestId('notification-bell-unknown')).not.toBeInTheDocument()
  })
})

/**
 * #2404.3 — `notificationLevelFor` écrivait le niveau à la création
 * (`notifications.service.ts:194`/`:301`), et `toNotificationItem` le relaie
 * désormais au wire — mais AUCUN écran ne le lisait avant ce test : la liste
 * de la cloche rendait le titre et le corps, jamais le niveau.
 */
describe('NotificationBell — le niveau nommé dans la liste (#2404.3)', () => {
  it('affiche le libellé nommé de chaque niveau', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({
        notifications: [
          makeItem({ id: 'n1', title: 'Signal critique', level: 'critical' }),
          makeItem({ id: 'n2', title: 'Signal information', level: 'information' }),
        ],
      }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Signal critique')).toBeInTheDocument()
    expect(screen.getByText('Critique')).toBeInTheDocument()
    expect(screen.getByText('Information')).toBeInTheDocument()
  })

  it('un niveau absent (`null`) ne s’affiche jamais « Information » par défaut (GA-18/GA-19)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({ notifications: [makeItem({ id: 'n1', title: 'Sans niveau', level: null })] }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Sans niveau')).toBeInTheDocument()
    expect(screen.queryByText('Information')).not.toBeInTheDocument()
  })
})

/**
 * #2404.7 — D'OÙ vient l'information. `source` voyage jusqu'au wire
 * (`toNotificationItem`) mais aucun écran ne le lisait encore : ce test
 * verrouille l'APPELANT côté affichage, même défaut que #2404.3 pour `level`.
 */
describe('NotificationBell — la source de l’information (#2404.7)', () => {
  it('affiche la source quand l’émetteur l’a nommée', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({ notifications: [makeItem({ id: 'n1', title: 'Une réponse est arrivée', source: 'Gmail' })] }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Une réponse est arrivée')).toBeInTheDocument()
    expect(screen.getByText(/Gmail/)).toBeInTheDocument()
  })

  it('une source absente ne s’affiche PAS — on n’affiche pas ce qu’on n’a pas', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({ notifications: [makeItem({ id: 'n1', title: 'Signal', source: null })] }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Signal')).toBeInTheDocument()
    expect(screen.queryByTestId('notification-source')).not.toBeInTheDocument()
  })
})

/**
 * #2404.7 — la ligne du registre porte l'état « partiel » : title/body/link/
 * created_at s'affichent (complétés par #2404.3 pour le niveau), mais aucun
 * bouton « réduire ce type » n'a jamais existé ici. Verrouille l'absence :
 * une catégorie de notification se règle depuis Réglages › Notifications
 * (GA-26, un réglage vit à un seul endroit), jamais depuis une notification
 * ouverte — l'ouvrir ne fait QUE la marquer lue et naviguer (`handleSelect`).
 */
describe('NotificationBell — pas de bouton « réduire ce type » (#2404.7)', () => {
  it('la notification ouverte (titre, corps, niveau) ne montre aucun bouton pour réduire sa catégorie', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({
        notifications: [makeItem({ id: 'n1', title: 'Signal', body: 'Un corps', level: 'action' })],
      }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    // La notification EST ouverte : titre, corps et niveau tous visibles.
    expect(await screen.findByText('Signal')).toBeInTheDocument()
    expect(screen.getByText('Un corps')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    // Aucun bouton pour réduire SA catégorie, ni sur la ligne ni ailleurs
    // dans le panneau.
    expect(screen.queryByRole('button', { name: /réduire/i })).not.toBeInTheDocument()
  })
})

/**
 * #2144.27 (épopée #2928) — PAS DEUX ALERTES IDENTIQUES SANS CONSOLIDATION.
 *
 * `useNotifications` fusionne déjà les alertes identiques (même type, même
 * lien, toutes deux non lues) ; ce test verrouille l'AFFICHAGE du compteur
 * qui en résulte — sans lui, une fusion invisible ferait juste disparaître
 * une alerte au lieu de montrer qu'elle représente plusieurs occurrences.
 */
describe('NotificationBell — le compteur d’occurrences consolidées (#2144.27)', () => {
  it('une alerte consolidée affiche son nombre d’occurrences', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({ notifications: [makeItem({ id: 'n1', title: 'Signal', occurrences: 3 })] }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Signal')).toBeInTheDocument()
    expect(screen.getByText('×3')).toBeInTheDocument()
  })

  it('une alerte SANS doublon (`occurrences: 1`) n’affiche aucun compteur', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({ notifications: [makeItem({ id: 'n1', title: 'Signal', occurrences: 1 })] }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Signal')).toBeInTheDocument()
    expect(screen.queryByText(/^×/)).not.toBeInTheDocument()
  })
})

/**
 * #3922.n — la notification « nouveau signal » porte ELLE-MÊME la preuve du
 * signal qu'elle cite : un lien externe nommé, ou « Sans lien vérifiable ».
 * Le lien vit HORS du bouton de la ligne (un `<a>` dans un `<button>` est du
 * HTML invalide, et le clic ouvrirait la veille en même temps).
 */
describe('NotificationBell — le lien vérifiable du signal (#3922.n)', () => {
  it('un signal avec URL : le lien nommé s’ouvre dans un nouvel onglet, hors du bouton de la ligne', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({
        notifications: [
          makeItem({
            type: 'buy_signal',
            title: 'Nouveau signal — SNCF',
            link: '/accounts/a1?tab=veille',
            source_url: 'https://www.bodacc.fr/annonce/1',
            source_kind: 'bodacc',
          }),
        ],
      }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    const link = await screen.findByRole('link', { name: /Voir l'annonce/ })
    expect(link).toHaveAttribute('href', 'https://www.bodacc.fr/annonce/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.closest('button')).toBeNull()
  })

  it('un signal SANS URL : aucune ligne, jamais un lien deviné', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({ notifications: [makeItem({ type: 'buy_signal', title: 'Nouveau signal — BPCE' })] }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Nouveau signal — BPCE')).toBeInTheDocument()
    expect(screen.queryByText('Sans lien vérifiable')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('une notification qui ne parle pas d’un signal n’écrit aucune ligne de lien', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(baseHook({ notifications: [makeItem({ type: 'system', title: 'Crédits' })] }))
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Crédits')).toBeInTheDocument()
    expect(screen.queryByText('Sans lien vérifiable')).not.toBeInTheDocument()
  })
})

// #4158.14 / #4158.18 — la boîte d'équipe vit DANS la cloche existante.
describe('NotificationBell — la boîte d’équipe (#4158.14)', () => {
  it('l’auteur d’un geste de collègue s’écrit en clair', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({
        notifications: [
          makeItem({
            type: 'account_assigned',
            title: 'Alice Martin t’a attribué le compte SNCF',
            actor_name: 'Alice Martin',
          }),
        ],
      }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByTestId('notification-actor')).toHaveTextContent('de Alice Martin')
  })

  it('une notification sans auteur ne fait AUCUNE ligne d’auteur', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(baseHook({ notifications: [makeItem({ title: 'Crédits bas' })] }))
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('Crédits bas')).toBeInTheDocument()
    expect(screen.queryByTestId('notification-actor')).not.toBeInTheDocument()
  })

  it('« Équipe » est un FILTRE de la même cloche : il redemande la boîte avec le périmètre équipe', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(baseHook())
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(mockUseNotifications).toHaveBeenLastCalledWith('all')

    await user.click(await screen.findByRole('button', { name: 'Équipe', pressed: false }))
    expect(mockUseNotifications).toHaveBeenLastCalledWith('team')
  })

  it('une boîte « Équipe » vide le dit, sans inventer de ligne', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(baseHook())
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    await user.click(await screen.findByRole('button', { name: 'Équipe', pressed: false }))

    expect(await screen.findByText('Aucune notification de tes collègues pour le moment')).toBeInTheDocument()
  })

  it('une entrée CALCULÉE n’affiche pas de date de naissance', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({
        notifications: [
          makeItem({
            id: 'derived:esn_description_pending:ws',
            type: 'esn_description_pending',
            title: '2 collègues attendent que tu décrives l’ESN',
            derived: true,
            link: '/settings/profile',
          }),
        ],
      }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('2 collègues attendent que tu décrives l’ESN')).toBeInTheDocument()
    expect(screen.queryByText(/à l'instant|il y a/)).not.toBeInTheDocument()
  })

  it('Théo / MAQ-SHELL-E34 — chaque ligne porte sa FAMILLE teintée, et « Nouveau » quand elle n’est pas lue', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({
        notifications: [
          makeItem({ id: 'a', type: 'buy_signal', title: 'Nouveau signal — SNCF' }),
          makeItem({
            id: 'b',
            type: 'action_overdue',
            title: '2 actions en retard',
            read_at: new Date().toISOString(),
          }),
        ],
      }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
    const families = screen.getAllByTestId('notification-family').map(node => node.textContent)
    expect(families).toEqual(['Signal', 'En retard'])
    expect(screen.getAllByLabelText('non lue')).toHaveLength(1)
  })

  it('décision Louis — les filtres se cumulent (multi-sélection) et portent leur compte, jamais « 0 »', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({
        notifications: [
          makeItem({ id: 'a', type: 'buy_signal', title: 'Signal A' }),
          makeItem({ id: 'b', type: 'buy_signal', title: 'Signal B', read_at: new Date().toISOString() }),
          makeItem({ id: 'c', type: 'client_reply', title: 'Réponse C' }),
          makeItem({ id: 'd', type: 'system', title: 'Système D' }),
        ],
      }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    const group = await screen.findByRole('group', { name: 'Filtrer la boîte de réception' })
    expect(within(group).getByRole('button', { name: 'Signaux 2' })).toBeInTheDocument()
    // Aucune ligne « En retard » reçue : le filtre reste, sans compte.
    expect(within(group).getByRole('button', { name: 'En retard' })).toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: 'Signaux 2' }))
    await user.click(within(group).getByRole('button', { name: 'Réponses 1' }))
    expect(screen.getByText('Signal A')).toBeInTheDocument()
    expect(screen.getByText('Réponse C')).toBeInTheDocument()
    expect(screen.queryByText('Système D')).not.toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: 'Non lues 3' }))
    expect(screen.queryByText('Signal B')).not.toBeInTheDocument()
    expect(screen.getByText('Signal A')).toBeInTheDocument()
  })

  it('« Plus de filtres » ouvre les familles moins fréquentes ; un filtre sans résultat le dit et se retire', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    mockUseNotifications.mockReturnValue(
      baseHook({ notifications: [makeItem({ id: 'a', type: 'buy_signal', title: 'Signal A' })] }),
    )
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(screen.queryByRole('button', { name: 'Rendez-vous' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Plus de filtres' }))
    await user.click(screen.getByRole('button', { name: 'Rendez-vous' }))
    expect(screen.getByText('Rien ne correspond à ces filtres.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer les filtres' }))
    expect(screen.getByText('Signal A')).toBeInTheDocument()
  })
})

/**
 * #4648 — « Vider » (Louis 27/10/2026) : le geste SUPPRIME pour de bon, donc il se confirme dans l'application
 * (dialogue du design system) — jamais `window.confirm`, qui gèle l'extension Chrome et bloque toute recette.
 */
describe('NotificationBell — Vider (#4648)', () => {
  const openBell = async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<NotificationBell />)
    await user.click(screen.getByRole('button', { name: /^Notifications/ }))
    return user
  }

  it('« Vider » se confirme dans l’application, puis vide', async () => {
    const clearAll = { mutate: vi.fn(), isPending: false }
    const nativeConfirm = vi.spyOn(window, 'confirm')
    mockUseNotifications.mockReturnValue(baseHook({ notifications: [makeItem()], clearAll }))
    const user = await openBell()

    await user.click(screen.getByRole('button', { name: 'Vider' }))
    expect(clearAll.mutate).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog', { name: 'Vider les notifications ?' })
    await user.click(within(dialog).getByRole('button', { name: 'Vider' }))
    expect(clearAll.mutate).toHaveBeenCalledTimes(1)
    expect(nativeConfirm).not.toHaveBeenCalled()
  })

  it('NON : annuler ne supprime rien', async () => {
    const clearAll = { mutate: vi.fn(), isPending: false }
    mockUseNotifications.mockReturnValue(baseHook({ notifications: [makeItem()], clearAll }))
    const user = await openBell()

    await user.click(screen.getByRole('button', { name: 'Vider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Vider les notifications ?' })
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    expect(clearAll.mutate).not.toHaveBeenCalled()
  })

  it('une boîte vide n’offre rien à vider, et dit ce qu’elle est', async () => {
    mockUseNotifications.mockReturnValue(baseHook({ notifications: [] }))
    await openBell()
    expect(screen.queryByRole('button', { name: 'Vider' })).not.toBeInTheDocument()
    expect(screen.getByText('Aucune notification pour le moment')).toBeInTheDocument()
  })
})
