import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le contrôle « besoins sans compétence typée », descendu sur l'écran où il se
 * répare (PDF 13, §171 — « sur cet écran, il SE CORRIGE ; sur Pilotage, il se
 * contemple »).
 *
 * C'est bien ici que le geste tombe : la colonne « Prochaine action » du tableau
 * dit déjà « Typer les compétences » sur ces lignes-là. Ce qui manquait est le
 * NOMBRE — combien de besoins sont dans ce cas, sur tout l'espace, pas sur la
 * page qu'on regarde.
 *
 * Ce test monte l'écran ENTIER, pas la pastille seule : la leçon du glisser-
 * déposer rendu inerte par un `disabled` sous trois gardes vertes.
 */

const hygiene = vi.fn()
// #1332 (2/9) — l'écran porte maintenant un entête personnalisé et l'accès au
// copilote, qui lisent le PROFIL (donc la session). Ce fichier ne mesure ni l'un
// ni l'autre : il double la feuille plutôt que de monter un fournisseur de
// session dont il n'a rien à faire. `''` = prénom inconnu, la branche qui garde
// la formule sans prénom.
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => hygiene() } }))

vi.mock('@/routes/projects/needs', () => ({ Route: { useSearch: () => ({}) } }))
// `Link` est nécessaire depuis que l'écran porte l'accès au copilote (#1334,
// 8/9) : c'est un LIEN qui pré-remplit la question, jamais un envoi. Sans lui,
// le rendu casse sur un export manquant.
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
// La porte de création (#1097 bis) est hors sujet ici — elle a son propre test
// (`OpenNeedsCreateNeed.test.tsx`) ; la monter réellement forcerait ce fichier à
// fournir aussi une session (elle interroge `GET /projects`).
vi.mock('./CreateNeedDialog', () => ({ CreateNeedDialog: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({
    data: {
      data: [{ id: 'n-1' }],
      pagination: { totalItems: 1, currentPage: 1, totalPages: 1, hasNext: false },
      counters: { total: 1, withoutShortlist: 0, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
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

describe('besoins ouverts — la pastille d’hygiène', () => {
  beforeEach(() => {
    cleanup()
    hygiene.mockReset()
  })

  it('affiche le compte du cockpit au-dessus de la liste', async () => {
    hygiene.mockResolvedValue({
      lines: [{ key: 'needs_without_skills', count: 4, total: 30, link: '/projects/needs' }],
    })
    draw()
    expect(await screen.findByText('sans compétence typée')).toBeInTheDocument()
    // Le seuil de ce contrôle est un DÉCOMPTE, pas une part : le nombre s'écrit nu.
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('ne montre aucune pastille quand la qualité des données n’est pas lisible', async () => {
    hygiene.mockRejectedValue(new Error('403'))
    draw()
    await new Promise(resolve => setTimeout(resolve, 0))
    // Ni « 0 », ni une alerte : ne rien montrer n'affirme rien.
    expect(screen.queryByText('sans compétence typée')).not.toBeInTheDocument()
  })
})
