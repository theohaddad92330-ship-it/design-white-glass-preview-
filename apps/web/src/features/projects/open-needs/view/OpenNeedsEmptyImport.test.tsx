import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * #2173.56 — L'ÉTAT VIDE « pour de bon » MÈNE À L'IMPORT EN MASSE, TRANCHÉ.
 *
 * Le lot précédent (18/09, matin) ouvrait le dépôt d'UNE fiche — le seul qui
 * existait alors, avec son libellé exact repris tel quel. Décision de Louis
 * (QCM, 18/09 au soir) : l'import de masse est le dépôt de PLUSIEURS fiches
 * de poste D'UN COUP (`ImportNeedsDialog.tsx`). Ce fichier garde le nouveau
 * contrat : le CTA porte désormais SON libellé, et ouvre CE dépôt — jamais
 * plus l'assistant à quatre étapes.
 */
const isError = vi.fn(() => false)
// Le filtre d'hygiène de la page (HygieneBadge) lit le cockpit : une offre sans accès, ici, ne change rien au dépôt.
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => Promise.reject(new Error('403')) } }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/routes/projects/needs', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
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
vi.mock('./NeedProposalsPanel', () => ({ NeedProposalsPanel: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
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

const createNeedDialogProps = vi.fn()
vi.mock('./CreateNeedDialog', () => ({
  CreateNeedDialog: (props: { open: boolean }) => {
    createNeedDialogProps(props)
    return null
  },
}))

const importNeedsDialogProps = vi.fn()
vi.mock('./ImportNeedsDialog', () => ({
  ImportNeedsDialog: (props: { open: boolean }) => {
    importNeedsDialogProps(props)
    return null
  },
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

beforeEach(() => {
  cleanup()
  isError.mockReturnValue(false)
  createNeedDialogProps.mockClear()
  importNeedsDialogProps.mockClear()
})

describe('Besoins ouverts — l’état vide « pour de bon » mène à l’import en masse', () => {
  it('offre le libellé de l’import en masse — « Importer des fiches de poste », jamais « Importer une fiche de poste »', () => {
    draw()
    expect(screen.getByRole('button', { name: 'Importer des fiches de poste' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importer une fiche de poste' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importer mes besoins' })).not.toBeInTheDocument()
  })

  it('le bouton ouvre le DÉPÔT MULTIPLE (`ImportNeedsDialog`), jamais l’assistant à quatre étapes', async () => {
    const user = draw()
    // Monté SEULEMENT à l'ouverture (`useAccounts` y lit la session) : avant
    // le clic, il n'est même pas rendu.
    expect(importNeedsDialogProps).not.toHaveBeenCalled()
    expect(createNeedDialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }))

    await user.click(screen.getByRole('button', { name: 'Importer des fiches de poste' }))

    expect(importNeedsDialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }))
    // Le bouton « Créer un besoin » du bandeau reste séparé : ce clic-ci
    // n'ouvre PAS l'assistant unitaire.
    expect(createNeedDialogProps).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }))
  })
})
