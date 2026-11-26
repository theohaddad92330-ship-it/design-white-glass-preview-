import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2777 — LE BESOIN DÉTECTÉ (sans projet), ATTEIGNABLE DEPUIS SON COMPTE.
 *
 * Le filtre `account_id` existe DÉJÀ de bout en bout — le contrat
 * (`NeedFilters.account_id`, `needFiltersToQuery`), le serveur
 * (`open-needs.service.ts:171`, `need.account_id = :accountId`) et même
 * l'écran (`ImportNeedsDialog` le pose déjà) — mais aucune page ne le POSAIT
 * depuis l'URL, donc aucun lien ne pouvait l'atteindre. Un besoin écrit par
 * la cascade du compte rendu (`MeetingNotesService.createAccountNeed`,
 * `status: 'detected'`, `project_id: null`) n'apparaît jamais sur l'onglet
 * « Besoins » du dossier compte (`TabNeeds`, qui ne lit QUE `projects`,
 * stage `confirmed`) — sa seule vue est ce plateau transverse. Sans ce
 * seed, il fallait retaper le nom du compte à la main pour le retrouver.
 */

const queries: unknown[] = []

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => Promise.resolve({ lines: [] }) } }))
vi.mock('@/routes/projects/needs', () => ({ Route: { useSearch: () => ({ account_id: 'acc-1' }) } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/matching/hooks', () => ({
  useRunMatch: () => ({ mutate: vi.fn(), data: undefined, isPending: false }),
}))
vi.mock('@/features/matching/view/MatchDrawer', () => ({ MatchDrawer: () => null }))
vi.mock('@/features/consultants/hooks', () => ({
  useTalentSearch: () => ({ data: { total: 3 }, isSuccess: true }),
}))
vi.mock('./NeedProposalsPanel', () => ({ NeedProposalsPanel: () => null }))
vi.mock('./OpenNeedsTable', () => ({ OpenNeedsTable: () => null }))
vi.mock('./NeedConsultantDoor', () => ({ NeedConsultantDoor: () => null }))
vi.mock('./CreateNeedDialog', () => ({ CreateNeedDialog: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../hooks/useOpenNeeds', () => ({
  useOpenNeeds: (query: unknown) => {
    queries.push(query)
    return {
      data: {
        data: [],
        pagination: { totalItems: 0, currentPage: 1, totalPages: 1, hasNext: false },
        counters: { total: 0, withoutShortlist: 0, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }
  },
}))

const { OpenNeedsPage } = await import('./OpenNeedsPage')

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpenNeedsPage />
    </QueryClientProvider>,
  )
}

describe('besoins ouverts — amorce ?account_id= depuis le dossier compte', () => {
  beforeEach(() => {
    cleanup()
    queries.length = 0
  })

  it('pose account_id dès le premier rendu, sans clic', () => {
    draw()
    const last = queries.at(-1) as { account_id?: string }
    expect(last.account_id).toBe('acc-1')
  })
})
