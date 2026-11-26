import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lot L-A (#4164) — ce fichier testait la page `/actions` entière ; le journal vit
 * désormais dans le tiroir « Historique » de la page « Aujourd'hui » (la file et le
 * routage d'URL ont leurs propres suites : `TodayPage.test.tsx`,
 * `ActionHistoryPage.test.tsx`).
 *
 * §L4, 30/08/2026 — défaut observé en production sur `/actions` : trois rangs
 * de sélection empilés avant la première ligne de contenu.
 *
 *   1. les onglets de SECTION (« Actions / Parcours / Écritures à valider /
 *      Séquences ») — hors de ce fichier, montés par `CustomerPageContent` ;
 *      « Outils connectés » en faisait partie jusqu'au 01/09/2026 ;
 *   2. les pastilles du Centre d'actions (« À valider / Planifiées / … ») —
 *      switch un ÉTAT D'EXÉCUTION affiché dans un widget titré, jamais une
 *      route ;
 *   3. un `TabNav` — LA MÊME forme que le rang 1 — qui filtrait le journal par
 *      catégorie (« Depuis ma connexion / Tous / Analyses / … »), en doublant
 *      la chip « type » déjà proposée par la barre d'outils.
 *
 * Ce test verrouille le retrait du rang 3 : plus de bouton « Analyses » sur
 * l'écran, et le mode « depuis ma dernière connexion » devient un bouton
 * bascule DANS la barre d'outils, qui se présente comme un filtre.
 */

const navigate = vi.fn()
let routerSearch: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    useNavigate: () => navigate,
    useSearch: () => routerSearch,
    // ⚠️ Le faux RECOPIE le `search` dans le `href` et TRANSMET la ref, comme le
    // vrai `Link` : le lien contextuel vers le copilote ne voyage que par là, et
    // un faux qui jette le paramètre laisserait passer un lien juste dont la
    // question serait perdue.
    Link: forwardRef<
      HTMLAnchorElement,
      { children: React.ReactNode; to: string; search?: Record<string, unknown>; className?: string }
    >(({ children, to, search, ...rest }, ref) => (
      <a
        {...rest}
        ref={ref}
        href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : to}
      >
        {children}
      </a>
    )),
  }
})

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))

const lastSeenFixture = vi.hoisted(() => ({ since: null as string | null, isLoading: false }))

vi.mock('@/features/action-history/hooks/useActionHistory', () => ({
  useActionHistory: () => ({ data: { data: [] }, isLoading: false, isFetching: false }),
  useLastSeen: () => ({ data: { since: lastSeenFixture.since }, isLoading: lastSeenFixture.isLoading }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('./TraceabilityPanel', () => ({ TraceabilityPanel: () => null }))
vi.mock('./ActionHistoryTable', () => ({ ActionHistoryTable: () => <div>Table du journal</div> }))

// #1687 — un espion, pas le module réel : ce fichier vérifie ce que
// `handleAddFilter` ÉMET.
const trackFilterApplied = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackFilterApplied: (...args: unknown[]) => trackFilterApplied(...args),
  // #2767 — la carte de priorité émet à l'affichage et à chaque geste.
  trackPriorityViewed: vi.fn(),
  trackPriorityAccepted: vi.fn(),
  trackPrioritySnoozed: vi.fn(),
  trackPriorityRejected: vi.fn(),
  trackPriorityCorrected: vi.fn(),
}))

const { ActionHistoryJournal } = await import('./ActionHistoryJournal')

describe('le journal /actions n’empile plus de rang d’onglets pour la catégorie', () => {
  beforeEach(() => {
    routerSearch = {}
    navigate.mockClear()
    lastSeenFixture.since = null
    lastSeenFixture.isLoading = false
  })
  afterEach(() => cleanup())

  it('aucun bouton de catégorie (« Analyses », « Tous », …) ne reste sur l’écran', () => {
    render(<ActionHistoryJournal />)
    for (const label of ['Analyses', 'Enrichissements', 'Exports', 'Messages', 'Rappels', 'Tous']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('le bouton « depuis ma connexion » de la barre d’outils bascule le mode delta', async () => {
    render(<ActionHistoryJournal />)
    await userEvent.click(screen.getByRole('button', { name: /connexion/i }))
    expect(navigate).toHaveBeenCalledTimes(1)
    const [{ search: updater }] = navigate.mock.calls[0] as [{ search: (prev: Record<string, unknown>) => unknown }]
    expect(updater({})).toEqual({ category: 'since' })
  })

  it('un lien hérité `?category=analysis` filtre toujours le journal (aucun lien cassé)', () => {
    routerSearch = { category: 'analysis' }
    render(<ActionHistoryJournal />)
    // Toujours pas d'onglet — mais la barre d'outils est bien là, avec le filtre.
    expect(screen.getByRole('button', { name: /7 derniers jours/i })).toBeInTheDocument()
  })
})

describe('#1687 — trackFilterApplied sur /actions', () => {
  beforeEach(() => {
    routerSearch = {}
    navigate.mockClear()
    trackFilterApplied.mockClear()
    lastSeenFixture.since = null
    lastSeenFixture.isLoading = false
  })
  afterEach(() => cleanup())

  it('« 7 derniers jours » émet trackFilterApplied("/actions", "period") — jamais "7d"', async () => {
    render(<ActionHistoryJournal />)
    await userEvent.click(screen.getByRole('button', { name: /7 derniers jours/i }))
    expect(trackFilterApplied).toHaveBeenCalledTimes(1)
    expect(trackFilterApplied).toHaveBeenCalledWith('/actions', 'period')
    expect(trackFilterApplied.mock.calls[0]).not.toContain('7d')
  })
})

/**
 * #1499 / #1500 — le journal dit ce qu'il est.
 */
describe('le journal d’activité dit son rôle', () => {
  beforeEach(() => {
    routerSearch = {}
  })

  it('#1500 — le journal porte son NOM, pas un intitulé de tableau', () => {
    const { container } = render(<ActionHistoryJournal />)
    expect(container.textContent).toContain("Journal d'activité")
    // ⚠️ Une SEULE fois : le titre vit dans la barre d'outils du journal, et
    // en ajouter un second au-dessus aurait dit deux fois la même chose.
    expect(container.textContent?.split("Journal d'activité").length).toBe(2)
    expect(container.textContent).not.toContain('Dernières actions enregistrées')
  })
})
