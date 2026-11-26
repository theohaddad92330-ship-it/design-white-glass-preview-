import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  defaultNotificationPreferences,
  NOTIFICATION_PRESETS,
  smsChannelWithoutNumber,
  type NotificationPreferences,
} from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

// Le module de veille a ses propres tests — ici on vérifie l'écran Notifications,
// pas le rendu de ses règles personnelles.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { NotificationsView } = await import('./NotificationsView')

const apiFetchMock = vi.mocked(apiFetch)

function serverPrefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return { ...defaultNotificationPreferences, email_language: 'fr', ...overrides }
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <NotificationsView />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiFetchMock.mockReset()
  apiFetchMock.mockResolvedValue(serverPrefs())
})

describe('NotificationsView — #1938.4 la section SMS est rendue par l’écran', () => {
  it('montre la section SMS, visible et inactive tant qu’aucun fournisseur n’est branché', async () => {
    // Le serveur, route par route : la section SMS a SA lecture, à part des
    // préférences (un numéro de téléphone ne voyage pas sur chaque écran).
    apiFetchMock.mockImplementation(async (call: { path: string }) =>
      call.path === '/notifications/sms' ? smsChannelWithoutNumber('coming_soon') : serverPrefs(),
    )
    renderView()

    expect(await screen.findByText('Alertes urgentes par SMS')).toBeInTheDocument()
    expect(await screen.findByText('Bientôt disponible')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Actions en retard par SMS' })).toBeDisabled()
    // #4463 — plus d'alerte SMS « crédits bientôt épuisés ».
    expect(screen.queryByRole('switch', { name: /Crédits bientôt épuisés/ })).not.toBeInTheDocument()
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/notifications/sms' })
  })
})

describe('NotificationsView — les 9 interrupteurs existants (régression, #4463 : sans « crédits bientôt épuisés »)', () => {
  it('rend toujours les 9 interrupteurs de réglage, et AUCUN interrupteur de crédit', async () => {
    // Par le RÔLE `switch`, jamais par le texte : « Résumé hebdomadaire » est
    // AUSSI le libellé d'une présélection ci-dessus, et un `findByText` non
    // scopé y trouverait deux éléments.
    renderView()
    for (const title of TOGGLE_NAMES) {
      expect(await screen.findByRole('switch', { name: title })).toBeInTheDocument()
    }
    expect(screen.queryByRole('switch', { name: /crédit/i })).not.toBeInTheDocument()
  })
})

describe('NotificationsView — Théo D settings-compte : UN bloc « Rythme et canaux »', () => {
  it('range le récapitulatif, la plage de tranquillité et les quatre canaux dans la même carte', async () => {
    renderView()
    const heading = await screen.findByRole('heading', { name: 'Rythme et canaux' })
    const block = heading.closest('section') as HTMLElement
    expect(block).not.toBeNull()
    expect(within(block).getByRole('radiogroup', { name: 'Récapitulatif préféré' })).toBeInTheDocument()
    expect(within(block).getByText('Plage de tranquillité')).toBeInTheDocument()
    expect(within(block).getByText('Par e-mail')).toBeInTheDocument()
    expect(within(block).getByText('Alertes urgentes par SMS')).toBeInTheDocument()
    expect(screen.getByText('Paramètres · Personnel')).toBeInTheDocument()
  })
})

/** Les 9 interrupteurs de l'écran (l'alerte « crédits bientôt épuisés » est retirée, #4463), par leur nom accessible. UNE liste, pour la
 *  garde de non-régression et pour #2082.17 — deux listes divergeraient. */
const TOGGLE_NAMES = [
  "Signaux d'achat",
  'Rappels de relance',
  'Résumé hebdomadaire',
  'Veille de la semaine',
  'Actions en retard',
  'Digest de veille quotidien',
  'Mises à jour dans la barre latérale',
  'Newsletter Changelog',
  'Laura peut te parler en premier',
] as const

/** Une CADENCE nommée : à quel rythme, ou sur quel déclencheur, ça arrive. */
const CADENCE = /hebdomadaire|chaque matin|chaque lundi|quotidien|par cycle|dès qu|par jour|1er et 15/i

/** Ce que la ligne doit dire de plus que son titre : une cadence ET un exemple
 *  de ce qui arrivera vraiment. Extraite pour que la garde puisse prouver
 *  qu'elle DISCRIMINE (voir « SAIT DIRE NON » ci-dessous). */
function namesCadenceAndExample(text: string): boolean {
  return CADENCE.test(text) && /Exemple\s*:/.test(text)
}

describe('NotificationsView — #2082.17 chaque ligne nomme la fréquence, le contenu et un exemple', () => {
  it('lit un corpus non vide — les 9 lignes de réglage sont à l’écran', async () => {
    renderView()
    for (const name of TOGGLE_NAMES) {
      expect(await screen.findByRole('switch', { name })).toBeInTheDocument()
    }
    expect(TOGGLE_NAMES.length).toBe(9)
  })

  it('CHAQUE ligne nomme une cadence ET donne un exemple concret', async () => {
    renderView()
    const manquantes: string[] = []
    for (const name of TOGGLE_NAMES) {
      const row = (await screen.findByRole('switch', { name })).parentElement
      if (!namesCadenceAndExample(row?.textContent ?? '')) manquantes.push(name)
    }
    expect(manquantes).toEqual([])
  })

  it('SAIT DIRE NON — une ligne qui n’annonce qu’un titre, ou qu’une moitié, est détectée', () => {
    expect(namesCadenceAndExample('Signaux d’achat')).toBe(false)
    expect(namesCadenceAndExample('Email hebdomadaire des signaux de veille.')).toBe(false)
    expect(namesCadenceAndExample('Exemple : « Nouveau signal — Acme Corp ».')).toBe(false)
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — une ligne complète passe', () => {
    expect(
      namesCadenceAndExample('Email hebdomadaire des signaux de veille. Exemple : « 3 signaux sur 2 comptes ».'),
    ).toBe(true)
  })
})

describe('NotificationsView — #2082.18 l’écran dit comment ARRÊTER de recevoir', () => {
  it('annonce que rien n’est coché d’avance, et les deux façons de couper', async () => {
    renderView()
    const entete = await screen.findByText(/Rien n'est coché d'avance/)
    // Les DEUX chemins réels : l'interrupteur (immédiat) et le lien de
    // désabonnement au bas de l'e-mail (suppression list #394).
    expect(entete.textContent ?? '').toMatch(/éteins son interrupteur/)
    expect(entete.textContent ?? '').toMatch(/Se désabonner/)
  })
})

describe('NotificationsView — #1938.6-9 présélections', () => {
  it('propose les 4 présélections nommées', async () => {
    renderView()
    expect(await screen.findByRole('radio', { name: /Urgent uniquement/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Brief quotidien/ })).toBeInTheDocument()
    // « Résumé hebdomadaire » existe aussi comme TITRE de réglage individuel :
    // on cible ici le groupe des présélections, pas la ligne du dessous.
    const group = screen.getByRole('radiogroup', { name: /récapitulatif/i })
    expect(within(group).getByRole('radio', { name: /Résumé hebdomadaire/ })).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: /Personnalisé/ })).toBeInTheDocument()
  })

  it('« Personnalisé » ne se clique jamais — c’est un état détecté, pas un réglage qu’on écrit', async () => {
    renderView()
    const custom = await screen.findByRole('radio', { name: /Personnalisé/ })
    expect(custom).toBeDisabled()
  })

  // #2082.16 — REVIREMENT : les défauts serveur n'étaient « conçus comme aucun
  // jeu » que parce qu'ils cochaient un e-mail hebdomadaire d'avance. Sans lui,
  // ils sont exactement « Urgent uniquement », et c'est ce que l'écran annonce
  // à qui n'a encore rien choisi.
  it('les défauts serveur se lisent « Urgent uniquement », coché (#2082.16)', async () => {
    renderView()
    const urgent = await screen.findByRole('radio', { name: /Urgent uniquement/ })
    await waitFor(() => expect(urgent).toHaveAttribute('aria-checked', 'true'))
    expect(await screen.findByRole('radio', { name: /Personnalisé/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('cliquer « Urgent uniquement » écrit les 7 réglages en un seul PATCH', async () => {
    const user = userEvent.setup()
    renderView()
    apiFetchMock.mockResolvedValueOnce(serverPrefs()) // le fetch initial
    const button = await screen.findByRole('radio', { name: /Urgent uniquement/ })
    apiFetchMock.mockResolvedValue(serverPrefs(NOTIFICATION_PRESETS.urgent_only))

    await user.click(button)

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/notifications/preferences',
        method: 'PATCH',
        body: NOTIFICATION_PRESETS.urgent_only,
      }),
    )
  })

  it('une fois « Urgent uniquement » actif, il est coché — et les autres ne le sont pas', async () => {
    apiFetchMock.mockResolvedValue(serverPrefs(NOTIFICATION_PRESETS.urgent_only))
    renderView()

    const urgent = await screen.findByRole('radio', { name: /Urgent uniquement/ })
    await waitFor(() => expect(urgent).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByRole('radio', { name: /Brief quotidien/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('toucher un interrupteur à la main fait bien passer l’état détecté à Personnalisé', async () => {
    const user = userEvent.setup()
    apiFetchMock.mockResolvedValue(serverPrefs(NOTIFICATION_PRESETS.urgent_only))
    renderView()
    const urgent = await screen.findByRole('radio', { name: /Urgent uniquement/ })
    await waitFor(() => expect(urgent).toHaveAttribute('aria-checked', 'true'))

    apiFetchMock.mockResolvedValue(serverPrefs({ ...NOTIFICATION_PRESETS.urgent_only, relance_reminders: true }))
    await user.click(screen.getByRole('switch', { name: 'Rappels de relance' }))

    const custom = await screen.findByRole('radio', { name: /Personnalisé/ })
    await waitFor(() => expect(custom).toHaveAttribute('aria-checked', 'true'))
    expect(urgent).toHaveAttribute('aria-checked', 'false')
  })
})

/**
 * Théo D settings-compte — cinq familles, plage de tranquillité, canaux.
 * Le réglage fin (les 10+ interrupteurs d'avant) reste, sous un repli.
 */
const FAMILY_NAMES = [
  'Échéances et tâches',
  'Réponses à mes échanges',
  'Nouveaux signaux',
  'Suivi des missions',
  'Actualités produit',
] as const

function patchesOf(): unknown[] {
  return apiFetchMock.mock.calls
    .map(call => call[0] as { path: string; method?: string; body?: unknown })
    .filter(call => call.method === 'PATCH' && call.path === '/notifications/preferences')
    .map(call => call.body)
}

describe('NotificationsView — settings-compte.R1 / N2 : cinq familles', () => {
  it('montre les cinq familles, chacune avec son interrupteur', async () => {
    renderView()
    for (const name of FAMILY_NAMES) {
      expect(await screen.findByRole('switch', { name })).toBeInTheDocument()
    }
  })

  it('couper « Nouveaux signaux » coupe toutes ses alertes en UN seul PATCH', async () => {
    const user = userEvent.setup()
    renderView()
    const family = await screen.findByRole('switch', { name: 'Nouveaux signaux' })
    await waitFor(() => expect(family).toBeChecked())
    await user.click(family)
    await waitFor(() =>
      expect(patchesOf()).toContainEqual({
        buy_signals: false,
        watchlist_daily_digest: false,
        weekly_digest: false,
        laura_enabled: false,
      }),
    )
  })

  it('rallumer une famille n’allume JAMAIS un envoi par e-mail — seulement ses alertes dans Bellum', async () => {
    const user = userEvent.setup()
    apiFetchMock.mockResolvedValue(
      serverPrefs({ buy_signals: false, watchlist_daily_digest: false, weekly_digest: false, laura_enabled: false }),
    )
    renderView()
    const family = await screen.findByRole('switch', { name: 'Nouveaux signaux' })
    await waitFor(() => expect(family).not.toBeChecked())
    await user.click(family)
    await waitFor(() => expect(patchesOf()).toContainEqual({ buy_signals: true, laura_enabled: true }))
  })

  it('le réglage fin garde TOUS les interrupteurs d’avant, sous un repli', async () => {
    renderView()
    expect(await screen.findByRole('button', { name: /Réglage fin/ })).toBeInTheDocument()
    for (const name of TOGGLE_NAMES) {
      expect(await screen.findByRole('switch', { name })).toBeInTheDocument()
    }
  })
})

describe('NotificationsView — settings-compte.N1 : plage de tranquillité', () => {
  it('écrit les deux heures en un seul PATCH', async () => {
    const user = userEvent.setup()
    renderView()
    const start = await screen.findByLabelText('Début de la plage de tranquillité')
    const end = screen.getByLabelText('Fin de la plage de tranquillité')
    await user.type(start, '21:00')
    await user.type(end, '07:00')
    await waitFor(() => expect(patchesOf()).toContainEqual({ quiet_hours_start: '21:00', quiet_hours_end: '07:00' }))
  })

  it('relit la plage enregistrée, et la retire en un geste', async () => {
    const user = userEvent.setup()
    apiFetchMock.mockResolvedValue(serverPrefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:30' }))
    renderView()
    const start = await screen.findByLabelText('Début de la plage de tranquillité')
    await waitFor(() => expect(start).toHaveValue('22:00'))
    await user.click(screen.getByRole('button', { name: 'Retirer la plage' }))
    await waitFor(() => expect(patchesOf()).toContainEqual({ quiet_hours_start: null, quiet_hours_end: null }))
  })

  it('dit ce que la plage retient — et que la cloche garde tout', async () => {
    renderView()
    expect(await screen.findByText(/la cloche garde tout/i)).toBeInTheDocument()
  })
})

describe('NotificationsView — settings-compte.N4 / A2 : les canaux disent leur état', () => {
  it('Dans Bellum est actif, l’e-mail est nommé en clair', async () => {
    renderView()
    expect(await screen.findByText('Dans Bellum')).toBeInTheDocument()
    expect(await screen.findByText(/u@example\.com/)).toBeInTheDocument()
  })

  it('le SMS et le navigateur restent des cartes de canal', async () => {
    renderView()
    expect(await screen.findByText('Alertes urgentes par SMS')).toBeInTheDocument()
  })
})

describe('NotificationsView — Théo A signaux-veilles.A2 : un seul éditeur de règles de veille', () => {
  it('renvoie vers « Mes veilles » au lieu de recopier l’éditeur des règles', async () => {
    renderView()
    const door = await screen.findByRole('link', {
      name: 'Gérer mes règles de veille (secteur, technologie, mot-clé…)',
    })
    expect(door).toHaveAttribute('href', '/signals/watches')
  })
})
