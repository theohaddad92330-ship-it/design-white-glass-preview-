import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Les deux états vides des besoins ouverts NOMMAIENT un geste sans l'offrir.
 *
 *  - filtré : « Aucun besoin ne correspond. **Assouplis un filtre** » — et rien
 *    ne permettait de le faire depuis là. La phrase désigne le geste du doigt,
 *    ce qui est pire qu'un silence : elle prouve qu'on savait quoi faire.
 *  - vide pour de bon : « Ils apparaîtront dès qu'un projet passe en besoin
 *    exprimé » — sans le moindre chemin vers les projets.
 *
 * La contradiction était INTERNE au fichier : trente lignes plus bas, les cinq
 * compteurs de tête sont déjà des filtres cliquables, avec le commentaire « un
 * compteur qui ne mène nulle part est une décoration ».
 */

const hygiene = vi.fn().mockRejectedValue(new Error('403'))
// #1332 (2/9) — l'écran porte maintenant un entête personnalisé et l'accès au
// copilote, qui lisent le PROFIL (donc la session). Ce fichier ne mesure ni l'un
// ni l'autre : il double la feuille plutôt que de monter un fournisseur de
// session dont il n'a rien à faire. `''` = prénom inconnu, la branche qui garde
// la formule sans prénom.
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => hygiene() } }))

vi.mock('@/routes/projects/needs', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  // La porte du vide « pour de bon » est un vrai lien : ça se tabule, ça
  // s'ouvre dans un onglet, ça s'annonce (GA-35).
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
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
// La troisième porte porte ses propres tests (`OpenNeedsThirdDoor.test.tsx`,
// `NeedConsultantDoor.test.tsx`). Ici elle n'apporterait que ses dépendances.
vi.mock('./NeedConsultantDoor', () => ({ NeedConsultantDoor: () => null }))
// La porte de création (#1097 bis) est hors sujet ici — elle a son propre test
// (`OpenNeedsCreateNeed.test.tsx`) ; la monter réellement forcerait ce fichier à
// fournir aussi une session (elle interroge `GET /projects`).
vi.mock('./CreateNeedDialog', () => ({ CreateNeedDialog: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const isError = vi.fn(() => false)
vi.mock('../hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({
    data: isError()
      ? undefined
      : {
          data: [],
          pagination: { totalItems: 0, currentPage: 1, totalPages: 1, hasNext: false },
          counters: { total: 0, withoutShortlist: 0, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 },
        },
    isLoading: false,
    isError: isError(),
    refetch: vi.fn(),
  }),
}))

const { OpenNeedsPage } = await import('./OpenNeedsPage')

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <OpenNeedsPage />
    </QueryClientProvider>,
  )
  return userEvent.setup({ pointerEventsCheck: 0 })
}

describe('Besoins ouverts — l’état vide FILTRÉ offre le geste qu’il nomme', () => {
  beforeEach(() => {
    cleanup()
    isError.mockReturnValue(false)
  })

  it('affiche une porte « Effacer les filtres » quand un filtre est posé', async () => {
    const user = draw()
    // Aucun filtre au départ : c'est l'autre vide qui s'affiche.
    expect(screen.getByText('Aucun besoin ouvert.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Effacer les filtres' })).not.toBeInTheDocument()

    // Refonte Théo — le filtre vit dans le menu « Filtres ».
    await user.click(screen.getByRole('button', { name: 'Filtres rapides' }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Sans shortlist' }))
    await user.keyboard('{Escape}')

    expect(screen.getByText('Aucun besoin ne correspond.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Effacer les filtres' })).toBeInTheDocument()
  })

  it('le geste EFFACE réellement les filtres — pas seulement le message', async () => {
    const user = draw()
    // Refonte Théo — le filtre vit dans le menu « Filtres ».
    await user.click(screen.getByRole('button', { name: 'Filtres rapides' }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Sans shortlist' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Effacer les filtres' }))

    // On est revenu au vide « pour de bon » : le filtre est retombé.
    expect(screen.getByText('Aucun besoin ouvert.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun besoin ne correspond.')).not.toBeInTheDocument()
  })
})

describe('Besoins ouverts — l’état vide « pour de bon » mène aux projets', () => {
  beforeEach(() => {
    cleanup()
    isError.mockReturnValue(false)
  })

  it('offre un lien vers le pipe, là où un projet passe en besoin exprimé', () => {
    draw()
    const door = screen.getByRole('link', { name: 'Ouvrir le pipe' })
    // La cible est PROUVÉE par son fichier de route : `routes/projects/index.tsx`.
    expect(door).toHaveAttribute('href', '/projects')
  })
})

describe('Besoins ouverts — aucune porte sur une PANNE', () => {
  beforeEach(() => {
    cleanup()
    isError.mockReturnValue(true)
  })

  it('n’offre ni « effacer les filtres » ni « ouvrir le pipe » quand le chargement a échoué', () => {
    draw()
    expect(screen.getByText('Je n’ai pas pu charger les besoins.')).toBeInTheDocument()
    // « Réessayer » est la seule réponse juste : envoyer chercher ailleurs
    // ferait lire une panne comme un fait.
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ouvrir le pipe' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Effacer les filtres' })).not.toBeInTheDocument()
  })
})
