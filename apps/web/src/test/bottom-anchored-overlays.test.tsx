import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { i18n } from '@/i18n'

// Radix a besoin de ces API pointer, absentes de jsdom.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

const notification = (id: string) => ({
  id,
  user_id: 'u-1',
  kind: 'buy_signal' as const,
  title: `Signal ${id}`,
  body: 'Un intitulé volontairement long pour éprouver la troncature horizontale du panneau',
  link: null,
  read_at: null,
  created_at: new Date().toISOString(),
})

vi.mock('@/features/notifications/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: Array.from({ length: 30 }, (_, i) => notification(`n-${i}`)),
    unreadCount: 30,
    isLoading: false,
    markRead: { mutate: vi.fn() },
    markAllRead: { mutate: vi.fn() },
    clearAll: { mutate: vi.fn(), isPending: false },
  }),
}))

vi.mock('@/features/changelog/useChangelog', () => ({
  useChangelog: () => ({
    entries: Array.from({ length: 30 }, (_, i) => ({
      id: `2026-07-${i}`,
      date: '19 juillet 2026',
      title: `Entrée ${i}`,
      items: ['Un item de changelog assez long pour tester le rendu du panneau'],
    })),
    hasUnseen: false,
    markAllSeen: vi.fn(),
  }),
}))

const { NotificationBell } = await import('@/features/notifications/components/NotificationBell')
const { ChangelogMenu } = await import('@/features/changelog/ChangelogMenu')

/**
 * Les deux panneaux ancrés en BAS de la sidebar (cloche Notifications, menu
 * Nouveautés) partageaient le même défaut : ils s'ouvraient vers le haut depuis
 * un ancrage bas, sans jamais se borner à la place réellement disponible, et
 * leur zone défilante n'avait pas de hauteur définie — donc rognée, non
 * défilable.
 *
 * L'invariant épinglé est celui vérifié DANS LE NAVIGATEUR : la borne doit être
 * posée sur le CONTENEUR DE DÉFILEMENT lui-même, jamais seulement sur le
 * panneau. Un `max-height` sur le panneau laisse sa hauteur « indéfinie » au
 * sens CSS : le `h-full` du viewport Radix retombe alors sur `auto`, le viewport
 * prend la hauteur du contenu et se fait rogner — mesuré à 2374 px de contenu
 * dans un panneau de 320 px, sans aucune barre de défilement.
 *
 * Elle doit en outre suivre `--radix-dropdown-menu-content-available-height`,
 * la place que Radix mesure entre l'ancre et le bord de l'écran, sans quoi un
 * plafond fixe déborde sur une fenêtre courte.
 */
const expectsBoundedScrollPanel = (panel: HTMLElement) => {
  const viewport = panel.querySelector('[data-radix-scroll-area-viewport]')
  expect(viewport).not.toBeNull()

  const scrollRoot = viewport?.parentElement
  // La borne vit sur le conteneur de défilement…
  expect(scrollRoot?.className).toMatch(/\bmax-h-\[/)
  // …et suit la place réellement disponible au-dessus de l'ancre.
  expect(scrollRoot?.className).toContain('--radix-dropdown-menu-content-available-height')
  // …que le viewport reprend à son compte (cf. scroll-area-contract.test.tsx).
  expect(viewport?.className).toContain('max-h-[inherit]')
}

describe('Panneaux ancrés en bas de sidebar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  // Refonte Théo (fe78b88fb3, 23/10) : la cloche n'est plus un menu ancré au pied de la barre mais un TIROIR de
  // droite pleine hauteur. Il n'a plus d'ancre basse à respecter ; ce qui reste vrai, c'est qu'il défile.
  it('Notifications : un tiroir de droite dont la liste défile', async () => {
    render(<NotificationBell />)
    await user().click(screen.getByRole('button', { name: /notification/i }))

    const panel = await screen.findByRole('dialog')
    expect(panel.querySelector('[data-radix-scroll-area-viewport]')).not.toBeNull()
  })

  it('Nouveautés : se borne à la hauteur disponible et défile', async () => {
    render(<ChangelogMenu />)
    await user().click(screen.getByRole('button', { name: /Nouveautés/i }))

    const panel = await screen.findByRole('menu')
    expectsBoundedScrollPanel(panel)
  })
})
