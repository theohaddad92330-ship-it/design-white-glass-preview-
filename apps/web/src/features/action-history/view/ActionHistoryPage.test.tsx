import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lot L-A (#4164) — `/actions` est « Aujourd'hui ». Cette enveloppe traduit l'URL
 * pour la page : aucun lien existant ne casse.
 *
 * La page est mockée (elle a sa suite, `TodayPage.test.tsx`) : ce test vérifie le
 * CONTRAT entre l'URL et elle.
 */
const navigate = vi.fn()
let routerSearch: Record<string, unknown> = {}
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => routerSearch,
}))

const todayProps = vi.fn()
vi.mock('@/features/today/TodayPage', () => ({
  TodayPage: (props: Record<string, unknown>) => {
    todayProps(props)
    return <div>Aujourd’hui</div>
  },
}))

const { ActionHistoryPage } = await import('./ActionHistoryPage')

const lastProps = () => todayProps.mock.calls.at(-1)?.[0] as Record<string, unknown>

describe('/actions — le routage d’URL vers « Aujourd’hui »', () => {
  beforeEach(() => {
    routerSearch = {}
    todayProps.mockClear()
    navigate.mockClear()
  })
  afterEach(() => cleanup())

  it('visite normale : rien d’imposé, tiroir fermé', () => {
    render(<ActionHistoryPage />)
    expect(screen.getByText('Aujourd’hui')).toBeInTheDocument()
    expect(lastProps()).toMatchObject({ overdueOnly: false, historyOpen: false, historyTab: undefined })
  })

  it('#2717 — `?tab=mine&overdue=true` (tuile « En retard ») montre la section en retard', () => {
    routerSearch = { tab: 'mine', overdue: true }
    render(<ActionHistoryPage />)
    expect(lastProps()).toMatchObject({ overdueOnly: true, historyOpen: false })
  })

  it('« Tout afficher » retire le filtre de l’URL', () => {
    routerSearch = { tab: 'mine', overdue: true }
    render(<ActionHistoryPage />)
    ;(lastProps() as { onClearOverdue: () => void }).onClearOverdue()
    const [{ search: updater }] = navigate.mock.calls[0] as [{ search: (prev: Record<string, unknown>) => unknown }]
    expect(updater(routerSearch)).toEqual({ tab: undefined, overdue: undefined })
  })

  it('#2867 — `?risk=high&agent=automation` devient les filtres Risque et Agent du menu', () => {
    routerSearch = { risk: 'high', agent: 'automation' }
    render(<ActionHistoryPage />)
    expect(lastProps()).toMatchObject({ initialFilters: { risk: 'high', agent: 'automation' } })
  })

  it.each(['running', 'done', 'failed', 'scheduled', 'workflows'])(
    '`?tab=%s` ouvre le tiroir « Historique » sur cette vue',
    tab => {
      routerSearch = { tab }
      render(<ActionHistoryPage />)
      expect(lastProps()).toMatchObject({ historyOpen: true, historyTab: tab })
    },
  )

  it('un filtre du journal (`?category=analysis`, `?period=7d`…) ouvre le tiroir sur le journal', () => {
    routerSearch = { period: '7d' }
    render(<ActionHistoryPage />)
    expect(lastProps()).toMatchObject({ historyOpen: true, historyTab: 'journal' })
  })
})
