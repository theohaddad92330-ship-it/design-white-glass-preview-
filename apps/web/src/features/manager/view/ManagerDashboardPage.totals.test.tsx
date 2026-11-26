import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerTeamStats } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ManagerDashboardPage } from './ManagerDashboardPage'

/**
 * « Une réponse juste, calculée, sans chemin depuis l'endroit où la question se
 * pose. »
 *
 * Les quatre totaux en tête de l'écran d'équipe étaient des `<div>` nus. Un
 * manager qui lit « 40 contacts » ne pouvait pas les ouvrir : le chiffre était
 * vrai, et les objets qu'il compte restaient à retrouver à la main.
 *
 * Chaque total mène désormais là où ses objets sont RÉELLEMENT rendus — et deux
 * d'entre eux mènent au JOURNAL, filtré sur la bonne catégorie, parce que c'est
 * là que les messages envoyés et les analyses lancées se lisent.
 */
const useManagerStatsMock = vi.fn()
vi.mock('../hooks/useManagerStats', () => ({
  useManagerStats: () => useManagerStatsMock(),
}))
vi.mock('../hooks/useAssignAccount', () => ({
  useAssignAccount: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../hooks/useObjectives', () => ({
  useTeamObjectives: () => ({ isSuccess: false, data: undefined }),
  useMyObjective: () => ({ isSuccess: false, data: undefined }),
  useUpsertMyObjective: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}))
vi.mock('../hooks/useTeamComments', () => ({
  useTeamComments: () => ({ isSuccess: false, data: undefined }),
  useCreateTeamComment: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u1' }, loading: false }),
}))

const STATS: ManagerTeamStats = {
  workspace: { id: 'w1', name: 'Skaizen', member_count: 1 },
  totals: { accounts: 12, contacts: 40, emails_sent: 5, analyses: 9 },
  pipeline: [],
  members: [
    {
      user_id: 'u1',
      name: 'Alice Martin',
      email: 'alice@esn.fr',
      role: 'owner',
      accounts: 12,
      contacts: 40,
      emails_sent: 5,
      analyses: 9,
      last_activity_at: '2026-07-19T10:00:00.000Z',
    },
  ],
}

/** Le href du lien dont le libellé porte ce total. */
function doorOf(label: string): string | null | undefined {
  // Dans « Adoption » seulement : le pouls porte aussi « Comptes actifs ».
  return within(screen.getByRole('region', { name: 'Adoption' }))
    .getAllByRole('link')
    .find(link => (link.textContent ?? '').includes(label))
    ?.getAttribute('href')
}

/**
 * Les totaux vivent dans « Adoption », repliée en bas de page (#4158.44 — le
 * seul détail replié de l'écran). On l'ouvre avant de chercher leurs liens.
 *
 * #4158.45 — le total « Analyses » n'est plus répété ici : il est dans le
 * pouls de l'équipe, comparé à la période précédente et cliquable vers le
 * journal filtré. Restent Comptes, Contacts et Emails envoyés.
 */
async function mount() {
  // Les totaux vivent dans le détail d'Activité & échanges › Journal.
  renderWithRouter(<ManagerDashboardPage />, '/team?onglet=activite&sous=journal')
  await screen.findByRole('heading', { level: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Adoption' }))
}

describe("ManagerDashboardPage — chaque total mène aux objets qu'il compte", () => {
  beforeEach(async () => {
    useManagerStatsMock.mockReset()
    useManagerStatsMock.mockReturnValue({ data: STATS, isLoading: false, error: null })
    await i18n.changeLanguage('fr')
  })

  it('ouvre la liste des comptes et celle des contacts depuis leur tuile', async () => {
    await mount()

    expect(doorOf('Comptes')).toBe('/accounts')
    expect(doorOf('Contacts')).toBe('/contacts')
  })

  it('ouvre le journal FILTRÉ pour les emails envoyés', async () => {
    await mount()

    // `/actions` sans filtre poserait le total sur une liste où il ne se
    // distingue pas. La catégorie EST la porte.
    expect(doorOf('Emails envoyés')).toBe('/actions?category=message')
  })

  it('rend les trois totaux TABULABLES — des liens, pas des div', async () => {
    await mount()

    for (const label of ['Comptes', 'Contacts', 'Emails envoyés']) {
      const door = doorOf(label)
      expect(door, `le total « ${label} » n'a pas de porte`).toBeTruthy()
    }
  })
})
