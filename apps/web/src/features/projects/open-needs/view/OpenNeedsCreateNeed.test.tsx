import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ProjectNeed } from '@bellum/contracts'

/**
 * LA PORTE MANQUANTE (#1097 bis) — « + Créer un besoin » sur `/projects/needs`.
 *
 * Avant ce lot, zéro occurrence de `createNeed` ou d'un libellé équivalent sur
 * cet écran : un besoin ne se créait QUE depuis le tiroir d'un projet déjà
 * ouvert. `POST /projects/:id/needs` existait, `useAddProjectNeed` existait —
 * personne, sur `/projects/needs`, ne pouvait les atteindre.
 *
 * Ce fichier garde le CÂBLAGE de la page, pas la logique du dialogue (couverte
 * par `CreateNeedDialog.test.tsx`) : le bouton ouvre la porte, et le besoin créé
 * envoie sur SA fiche — pas un rafraîchissement de la liste courante, qui
 * pourrait le cacher sous un filtre actif que le besoin neuf ne remplit pas.
 */

const navigate = vi.fn()
let search: { match?: string } = {}

// #1332 (2/9) — l'écran porte maintenant un entête personnalisé et l'accès au
// copilote, qui lisent le PROFIL (donc la session). Ce fichier ne mesure ni l'un
// ni l'autre : il double la feuille plutôt que de monter un fournisseur de
// session dont il n'a rien à faire. `''` = prénom inconnu, la branche qui garde
// la formule sans prénom.
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/routes/projects/needs', () => ({ Route: { useSearch: () => search } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/matching/hooks', () => ({
  useRunMatch: () => ({ mutate: vi.fn(), data: undefined, isPending: false }),
}))
vi.mock('@/features/matching/view/MatchDrawer', () => ({ MatchDrawer: () => null }))
vi.mock('@/features/consultants/hooks', () => ({
  useTalentSearch: () => ({ data: { total: 3 }, isSuccess: true }),
}))
vi.mock('./NeedConsultantDoor', () => ({ NeedConsultantDoor: () => null }))
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
vi.mock('./NeedProposalsPanel', () => ({ NeedProposalsPanel: () => null }))

// Stub léger : ce fichier ne re-teste pas le formulaire (titre, recherche de
// projet, échec…), déjà couvert par `CreateNeedDialog.test.tsx`. Il vérifie
// que la PAGE lui passe la bonne porte et réagit au bon signal de sortie.
const createNeedDialogProps = vi.fn()
vi.mock('./CreateNeedDialog', () => ({
  CreateNeedDialog: (props: { open: boolean; onCreated: (need: ProjectNeed) => void }) => {
    createNeedDialogProps(props)
    if (!props.open) return null
    return (
      <button type="button" onClick={() => props.onCreated({ id: 'n-99' } as ProjectNeed)}>
        simulate-created
      </button>
    )
  },
}))

const { OpenNeedsPage } = await import('./OpenNeedsPage')

beforeEach(() => {
  cleanup()
  navigate.mockClear()
  createNeedDialogProps.mockClear()
  search = {}
})

/**
 * `OpenNeedsPage` lit désormais le droit financier (`useFinanceAccess`, pour le
 * bandeau de tête et le cumul du kanban — voir `NeedsKanban.tsx`), donc un
 * `QueryClient` réel doit exister même si ce fichier ne teste rien de ce côté.
 */
function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('la porte manquante — créer un besoin depuis la liste', () => {
  it('le bouton existe et ouvre le dialogue', async () => {
    const user = userEvent.setup()
    wrap(<OpenNeedsPage />)

    expect(createNeedDialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }))

    await user.click(screen.getByRole('button', { name: 'Ajouter un besoin' }))

    expect(createNeedDialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }))
  })

  it('un besoin créé envoie sur SA fiche, pas sur un rafraîchissement de la liste', async () => {
    const user = userEvent.setup()
    wrap(<OpenNeedsPage />)

    await user.click(screen.getByRole('button', { name: 'Ajouter un besoin' }))
    await user.click(screen.getByText('simulate-created'))

    expect(navigate).toHaveBeenCalledWith({ to: '/projects/needs/$needId', params: { needId: 'n-99' } })
    // La porte se referme : elle ne reste pas ouverte sur le besoin qu'on vient
    // de créer, prête à en recréer un second par erreur.
    expect(createNeedDialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }))
  })
})
