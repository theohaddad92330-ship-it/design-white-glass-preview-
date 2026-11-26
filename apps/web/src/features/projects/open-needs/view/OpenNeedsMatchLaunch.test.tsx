import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mutate = vi.fn()
let search: { match?: string } = {}

// #1332 (2/9) — l'écran porte maintenant un entête personnalisé et l'accès au
// copilote, qui lisent le PROFIL (donc la session). Ce fichier ne mesure ni l'un
// ni l'autre : il double la feuille plutôt que de monter un fournisseur de
// session dont il n'a rien à faire. `''` = prénom inconnu, la branche qui garde
// la formule sans prénom.
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/routes/projects/needs', () => ({ Route: { useSearch: () => search } }))
// `Link` est requis depuis que l'état vide « aucun besoin ouvert » offre une
// porte vers le pipe : ce test rend justement cet état (la liste est vide).
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/matching/hooks', () => ({
  useRunMatch: () => ({ mutate, data: undefined, isPending: false }),
}))
vi.mock('@/features/matching/view/MatchDrawer', () => ({ MatchDrawer: () => null }))
vi.mock('@/features/consultants/hooks', () => ({
  useTalentSearch: () => ({ data: { total: 3 }, isSuccess: true }),
}))
vi.mock('./NeedConsultantDoor', () => ({ NeedConsultantDoor: () => null }))
// La porte de création (#1097 bis) est hors sujet ici — elle a son propre test
// (`OpenNeedsCreateNeed.test.tsx`) ; la monter réellement forcerait ce fichier à
// fournir aussi une session (elle interroge `GET /projects`).
vi.mock('./CreateNeedDialog', () => ({ CreateNeedDialog: () => null }))
vi.mock('../hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({
    data: { data: [], pagination: { totalItems: 0 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// Les propositions de besoins vivent sur le même écran mais répondent à une
// autre question. Elles sont neutralisées ici pour que ce test reste celui du
// lien `?match=` — le panneau a ses propres garanties ailleurs.
vi.mock('./NeedProposalsPanel', () => ({ NeedProposalsPanel: () => null }))

const { OpenNeedsPage } = await import('./OpenNeedsPage')

/**
 * `OpenNeedsPage` lit désormais le droit financier (`useFinanceAccess`, pour le
 * bandeau de tête et le cumul du kanban — voir `NeedsKanban.tsx`), donc un
 * `QueryClient` réel doit exister même si ce fichier ne teste rien de ce côté.
 */
function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

/**
 * Trouvé en recette : le bouton lançait le calcul ET naviguait, si bien qu'un
 * lien `?match=…` collé dans un message — la promesse même du panneau
 * partageable — ouvrait un tiroir bloqué sur « Je compare les profils… ».
 *
 * C'est donc l'URL qui doit lancer la lecture. Le test vérifie les deux moitiés
 * du contrat : elle la lance, et elle ne la relance pas à chaque rendu — sinon
 * chaque re-rendu écrirait une ligne de journal de plus.
 */
describe('le panneau ouvert par un lien', () => {
  beforeEach(() => {
    cleanup()
    mutate.mockClear()
  })

  it('lance le classement quand l’URL porte un besoin', () => {
    search = { match: '11111111-1111-4111-8111-111111111111' }
    wrap(<OpenNeedsPage />)
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.anything())
  })

  it('ne relance rien au re-rendu', () => {
    search = { match: '11111111-1111-4111-8111-111111111111' }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={client}>
        <OpenNeedsPage />
      </QueryClientProvider>,
    )
    view.rerender(
      <QueryClientProvider client={client}>
        <OpenNeedsPage />
      </QueryClientProvider>,
    )
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('ne lance rien sans besoin dans l’URL', () => {
    search = {}
    wrap(<OpenNeedsPage />)
    expect(mutate).not.toHaveBeenCalled()
  })
})
