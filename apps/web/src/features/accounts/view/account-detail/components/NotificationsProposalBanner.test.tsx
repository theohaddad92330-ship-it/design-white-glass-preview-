import type { Account, OnboardingActivation } from '@bellum/contracts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2082.1 — proposer les notifications navigateur AU JALON « premier dossier
 * consulté » (`dossier_viewed`), sur le dossier lui-même — pas une étape
 * neuve du parcours, et pas dans les réglages où `BrowserChannelSection`
 * vit déjà (#1938.3, réutilisé ici via le même hook).
 */

const setChannelEnabled = vi.fn(() => Promise.resolve('granted' as NotificationPermission))
const channelState = vi.hoisted(() => ({
  permission: 'default' as 'default' | 'granted' | 'denied' | 'unsupported',
  enabled: false,
}))
vi.mock('@/features/notifications/hooks/useBrowserNotificationChannel', () => ({
  useBrowserNotificationChannel: () => ({
    permission: channelState.permission,
    enabled: channelState.enabled,
    setChannelEnabled,
  }),
}))

const activation = vi.fn<() => { data: OnboardingActivation | undefined; isPending?: boolean }>()
vi.mock('@/features/onboarding/hooks/useActivation', () => ({
  useActivation: () => activation(),
}))

const dismissNotificationsProposal = vi.fn()
const isNotificationsProposalDismissed = vi.fn(() => false)
vi.mock('@/features/notifications/browser-channel/browser-notification-channel', () => ({
  dismissNotificationsProposal: (...args: unknown[]) => dismissNotificationsProposal(...args),
  isNotificationsProposalDismissed: () => isNotificationsProposalDismissed(),
}))

const { NotificationsProposalBanner } = await import('./NotificationsProposalBanner')

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'a-1', company_name: 'ACME', status: 'completed', ...overrides } as Account
}

function activationOf(dossier_viewed: boolean): OnboardingActivation {
  return {
    dossier_viewed,
    profile_completed: true,
    analysis_launched: true,
    contact_enriched: false,
    message_prepared: false,
    tool_connected: false,
    correction_made: false,
    colleague_invited: 'not_applicable',
    completed_count: 2,
    applicable_count: 7,
    is_complete: false,
  } as unknown as OnboardingActivation
}

beforeEach(() => {
  channelState.permission = 'default'
  channelState.enabled = false
  isNotificationsProposalDismissed.mockReturnValue(false)
  activation.mockReturnValue({ data: activationOf(true) })
  setChannelEnabled.mockClear()
  dismissNotificationsProposal.mockClear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// #3465 — la bannière arrivait APRÈS la lecture de l'activation et faisait
// retomber la rangée d'une ligne (~59 px) : la barre d'onglets sautait sous le
// clic. Pendant le chargement on réserve donc SA place, invisible et inerte.
describe('#3465 — la place est réservée pendant le chargement', () => {
  it("réserve un emplacement invisible et inerte tant que l'activation charge", () => {
    activation.mockReturnValue({ data: undefined, isPending: true })
    render(<NotificationsProposalBanner account={account()} />)
    const slot = screen.getByTestId('notifications-proposal-banner')
    expect(slot).toHaveAttribute('aria-hidden', 'true')
    expect(slot.className).toContain('invisible')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ne réserve rien quand la proposition a déjà été refusée', () => {
    isNotificationsProposalDismissed.mockReturnValue(true)
    activation.mockReturnValue({ data: undefined, isPending: true })
    const { container } = render(<NotificationsProposalBanner account={account()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("libère la place quand le jalon n'est pas atteint", () => {
    activation.mockReturnValue({ data: activationOf(false), isPending: false })
    const { container } = render(<NotificationsProposalBanner account={account()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('#2082.1 — visible seulement au bon moment', () => {
  it("ne montre rien tant que le dossier n'est pas terminé", () => {
    const { container } = render(<NotificationsProposalBanner account={account({ status: 'analyzing' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("ne montre rien si le jalon dossier_viewed n'est pas atteint", () => {
    activation.mockReturnValue({ data: activationOf(false) })
    const { container } = render(<NotificationsProposalBanner account={account()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("ne montre rien tant que l'activation n'a pas encore répondu", () => {
    activation.mockReturnValue({ data: undefined })
    const { container } = render(<NotificationsProposalBanner account={account()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne montre rien si le canal est déjà actif (réglage + permission granted)', () => {
    channelState.permission = 'granted'
    channelState.enabled = true
    const { container } = render(<NotificationsProposalBanner account={account()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne montre rien si déjà refusée sur ce navigateur', () => {
    isNotificationsProposalDismissed.mockReturnValue(true)
    const { container } = render(<NotificationsProposalBanner account={account()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('montre la proposition quand tout le permet', () => {
    render(<NotificationsProposalBanner account={account()} />)
    expect(screen.getByRole('button', { name: /activer/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /plus tard/i })).toBeTruthy()
  })
})

describe('#2082.10 — bloqué SE DIT, jamais un échec silencieux', () => {
  it('permission refusée : le geste mort disparaît, le motif reste — pas un bloc vide', () => {
    channelState.permission = 'denied'
    render(<NotificationsProposalBanner account={account()} />)
    expect(screen.queryByRole('button', { name: /activer/i })).not.toBeInTheDocument()
    expect(screen.getByText(/refusé les notifications pour ce site/i)).toBeInTheDocument()
  })

  it('navigateur non compatible : la raison est nommée, pas devinée', () => {
    channelState.permission = 'unsupported'
    render(<NotificationsProposalBanner account={account()} />)
    expect(screen.queryByRole('button', { name: /activer/i })).not.toBeInTheDocument()
    expect(screen.getByText(/ne propose pas les notifications natives/i)).toBeInTheDocument()
  })

  it('acquitter un état bloqué le fait disparaître, comme un refus classique', () => {
    channelState.permission = 'denied'
    render(<NotificationsProposalBanner account={account()} />)
    fireEvent.click(screen.getByRole('button', { name: /compris/i }))
    expect(dismissNotificationsProposal).toHaveBeenCalledTimes(1)
  })
})

describe('#2082.1 — les deux gestes', () => {
  it("accepter appelle setChannelEnabled(true) — c'est le canal #1938.3, réutilisé", async () => {
    render(<NotificationsProposalBanner account={account()} />)
    fireEvent.click(screen.getByRole('button', { name: /activer/i }))
    expect(setChannelEnabled).toHaveBeenCalledWith(true)
  })

  it('refuser persiste le refus ET fait disparaître la bannière dans la session, sans recharger', () => {
    const { container } = render(<NotificationsProposalBanner account={account()} />)
    fireEvent.click(screen.getByRole('button', { name: /plus tard/i }))
    expect(dismissNotificationsProposal).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })
})

// #2510 — Louis : « à mettre sur la ligne d'en dessous en beaucoup plus petit
// pour qu'on ait les 4 éléments sur une ligne ». La bannière rejoint
// `account-context-row` (AccountDetail.tsx) comme les trois autres bandes —
// donc un pavé compact, une hauteur de ligne, pas une carte deux lignes.
describe('#2510 — un pavé compact, pas une carte pleine largeur', () => {
  it('ne wrap jamais sur plusieurs lignes, comme les autres bandes de la ligne compacte', () => {
    render(<NotificationsProposalBanner account={account()} />)
    const root = screen.getByTestId('notifications-proposal-banner')
    expect(root.className).not.toContain('py-3')
    expect(root.className).not.toContain('flex-wrap')
  })

  it('la description n’est plus un second paragraphe visible — elle vit en `title`, rien n’est retiré', () => {
    render(<NotificationsProposalBanner account={account()} />)
    expect(screen.queryByText(/tu seras prévenu dès qu’un dossier est prêt/i)).toBeNull()
    const title = screen.getByText("Ne rate plus la fin d'une analyse")
    expect(title.getAttribute('title')).toContain("Ne rate plus la fin d'une analyse")
    expect(title.getAttribute('title')).toContain('tu seras prévenu')
  })
})
