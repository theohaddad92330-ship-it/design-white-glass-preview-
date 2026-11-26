import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2173.16 — Vue rapide : « En attente client ».
 *
 * Trois des quatre vues rapides de l'issue existaient déjà (`À traiter` = le
 * défaut, `Sans profil`, `Démarrage sous 30 jours`, `À qualifier`) et étaient
 * branchées sur le contrat serveur — voir le commentaire #1334 (7/9) dans
 * `OpenNeedsPage.tsx`. `client_review` existe DÉJÀ comme statut stocké
 * (`NEED_STATUS_VARIANT`, `OpenNeedsTable.tsx:70`) : la vue rapide ne fait que
 * poser le MÊME filtre `status` que « À qualifier », sur une autre valeur.
 *
 * Même patron de montage que `OpenNeedsHygiene.test.tsx` : l'écran ENTIER, pas
 * la pastille seule.
 */

const queries: unknown[] = []

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => Promise.resolve({ lines: [] }) } }))
vi.mock('@/routes/projects/needs', () => ({ Route: { useSearch: () => ({}) } }))
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

/** Refonte Théo — les filtres rapides vivent dans le menu « Filtres » : on l'ouvre, puis on coche. */
function pick(label: string) {
  if (!screen.queryByRole('menu')) {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Filtres rapides' }), { button: 0, ctrlKey: false })
  }
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: label }))
}

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OpenNeedsPage />
    </QueryClientProvider>,
  )
}

describe('besoins ouverts — vue rapide « En attente client »', () => {
  beforeEach(() => {
    cleanup()
    queries.length = 0
  })

  it('pose le filtre status=client_review au clic', () => {
    draw()
    pick('En attente client')
    const last = queries.at(-1) as { status?: string }
    expect(last.status).toBe('client_review')
  })

  it('bascule off au second clic, comme les autres pastilles rapides', () => {
    draw()
    pick('En attente client')
    pick('En attente client')
    const last = queries.at(-1) as { status?: string }
    expect(last.status).toBeFalsy()
  })

  it('est mutuellement exclusive avec « À qualifier » — un seul statut à la fois', () => {
    draw()
    pick('À qualifier')
    pick('En attente client')
    const last = queries.at(-1) as { status?: string }
    expect(last.status).toBe('client_review')
    expect(screen.getByRole('menuitemcheckbox', { name: 'À qualifier' })).toHaveAttribute('aria-checked', 'false')
  })
})

/**
 * #2173.49 — Vue rapide : « Archivés ». Un rangement, pas un statut : elle
 * pose `archived=true` et se compose avec les autres critères, comme
 * `deadline_passed` le fait déjà.
 */
describe('besoins ouverts — vue rapide « Archivés »', () => {
  beforeEach(() => {
    cleanup()
    queries.length = 0
  })

  it('pose le filtre archived=true au clic', () => {
    draw()
    pick('Archivés')
    const last = queries.at(-1) as { archived?: boolean }
    expect(last.archived).toBe(true)
  })

  it('bascule off au second clic, comme les autres pastilles rapides', () => {
    draw()
    pick('Archivés')
    pick('Archivés')
    const last = queries.at(-1) as { archived?: boolean }
    expect(last.archived).toBeFalsy()
  })
})
