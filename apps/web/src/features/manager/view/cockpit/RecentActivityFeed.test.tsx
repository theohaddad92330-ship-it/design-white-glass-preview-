import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerMemberStats, ManagerPeriodActivity } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/** Théo D team-activite › Journal : type de fait (multi), période, « Exporter cette vue », état vide nommé. */

const dataExit = vi.fn()
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => dataExit() }))
const downloadCSV = vi.fn()
vi.mock('@/lib/export-csv', () => ({ downloadCSV: (...args: unknown[]) => downloadCSV(...args) }))

const { RecentActivityFeed } = await import('./RecentActivityFeed')

const MEMBERS = [{ user_id: 'u1', name: 'Léa' }] as ManagerMemberStats[]
const event = (id: string, action_type: string, company_name: string | null = 'EDF') => ({
  id,
  user_id: 'u1',
  action_type,
  account_id: company_name ? `acc-${id}` : null,
  company_name,
  created_at: '2026-10-19T09:12:00.000Z',
})
const ACTIVITY = {
  total: 3,
  items: [event('e1', 'analysis_completed'), event('e2', 'rdv_obtained'), event('e3', 'plan_action_created', null)],
} as unknown as ManagerPeriodActivity

beforeEach(() => {
  vi.clearAllMocks()
  dataExit.mockReturnValue({ allowed: true, grant: Object.freeze({}) })
})

describe('Journal d’activité', () => {
  it('le type de fait se choisit en multi-sélection', async () => {
    renderWithRouter(<RecentActivityFeed activity={ACTIVITY} members={MEMBERS} days={30} onPeriod={vi.fn()} />)
    const group = await screen.findByRole('group', { name: 'Type de fait' })
    expect(screen.getAllByRole('article')).toHaveLength(3)
    fireEvent.click(within(group).getByRole('button', { name: /Suivi commercial/ }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.click(within(group).getByRole('button', { name: /Actions & délégations/ }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('la période se change dans la barre du journal', async () => {
    const onPeriod = vi.fn()
    renderWithRouter(<RecentActivityFeed activity={ACTIVITY} members={MEMBERS} days={30} onPeriod={onPeriod} />)
    expect(await screen.findByRole('combobox', { name: 'Période du journal' })).toBeInTheDocument()
  })

  it('« Exporter cette vue » recopie les faits affichés, si l’espace autorise l’export', async () => {
    renderWithRouter(<RecentActivityFeed activity={ACTIVITY} members={MEMBERS} days={30} onPeriod={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Exporter cette vue' }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadCSV.mock.calls[0] as [string, string]
    expect(filename).toBe('journal-equipe-30j.csv')
    expect(csv).toContain('Léa')
    expect(csv).toContain('EDF')
  })

  it('sans l’autorisation de l’espace, pas de bouton d’export', async () => {
    dataExit.mockReturnValue({ allowed: false, grant: null })
    renderWithRouter(<RecentActivityFeed activity={ACTIVITY} members={MEMBERS} days={30} onPeriod={vi.fn()} />)
    await screen.findByRole('group', { name: 'Type de fait' })
    expect(screen.queryByRole('button', { name: 'Exporter cette vue' })).not.toBeInTheDocument()
  })

  it('aucun fait : la phrase le dit, aucune ligne', async () => {
    renderWithRouter(<RecentActivityFeed activity={undefined} members={MEMBERS} days={7} onPeriod={vi.fn()} />)
    expect(await screen.findByTestId('activity-empty')).toHaveTextContent(
      'Aucun fait enregistré sur les 7 derniers jours.',
    )
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })
})
