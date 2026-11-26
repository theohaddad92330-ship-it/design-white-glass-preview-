import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TalentRow } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — « reconnaître l'intention
 * push profil ». Laura ne peut pousser aucun profil elle-même (aucun chemin
 * d'écriture, doctrine « le copilote prépare ») : la tranche minimale vraie et
 * testable est qu'elle sache OUVRIR le Vivier sur la bonne affaire — via
 * `?matchProjectId=`, lu par `ConsultantsPage` (`consultants/index.tsx`) et
 * transmis à `ConsultantMatchPanel.selectedId`, exactement comme le rail
 * « Matching suggéré » le fait déjà pour un clic dans l'écran.
 *
 * Le panneau reste FERMÉ à l'arrivée (#1795/#1808/#1809/#1813) : cette suite
 * vérifie la présélection, pas une ouverture automatique.
 */

const search = vi.fn(() => ({}) as { matchProjectId?: string })
const talents = vi.fn(() => ({
  data: { items: [] as TalentRow[], total: 0, page: 1, limit: 25 },
  isLoading: false,
}))
const matchPanelProps = vi.fn()

// #3781 — l'écran lit `useIsDemo` (le bouton « Supprimer définitivement » n'existe pas en salle partagée).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => Promise.reject(new Error('403')) } }))
vi.mock('@/routes/consultants/index', () => ({ Route: { useSearch: () => search() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
}))
// c88 (04/10/2026) — le bandeau des CV non lus porte SES hooks ; ce test vise autre chose.
vi.mock('../hooks', () => ({
  useCvAutoReadStatus: () => ({ data: { unread: 0, progress: null, failed: [] } }),
  useCvAutoReadRetryFailed: () => ({ isPending: false, isError: false, mutate: vi.fn(), error: null }),
  useTalentStats: () => ({ data: undefined }),
  useCvCsvImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConsultant: () => ({ data: undefined }),
  useCreateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEraseTalents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTalentFavorite: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveTalentsBulk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTalentSearch: () => talents(),
}))
vi.mock('./CvDropZone', () => ({ CvDropZone: () => null }))
vi.mock('./CvZipImportDialog', () => ({ CvZipImportDialog: () => null }))
vi.mock('./CvMailImportDialog', () => ({ CvMailImportDialog: () => null }))
// #2326.7/.8/.9 (épopée #2794) — disponibilités et export ATS, hors sujet ici.
vi.mock('./AvailabilityImportDialog', () => ({ AvailabilityImportDialog: () => null }))
vi.mock('./AtsExportButton', () => ({ AtsExportButton: () => null }))
// #1952.6 (épopée #2844) — même raison d'être : hors sujet ici.
vi.mock('./BulkExportButton', () => ({ BulkExportButton: () => null }))
vi.mock('./ConsultantFormDialog', () => ({ ConsultantFormDialog: () => null }))
vi.mock('./VivierAddDialog', () => ({ VivierAddDialog: () => null }))
vi.mock('./ConsultantMatchPanel', () => ({
  ConsultantMatchPanel: (props: { selectedId: string | null }) => {
    matchPanelProps(props)
    return null
  },
}))
vi.mock('./NeedsMatchRail', () => ({ NeedsMatchRail: () => null }))
vi.mock('./TalentDeleteDialog', () => ({ TalentDeleteDialog: () => null }))
vi.mock('./TalentSkillsDialog', () => ({ TalentSkillsDialog: () => null }))
vi.mock('./TalentPlacementsChip', () => ({ TalentPlacementsChip: () => null }))
vi.mock('./TalentStatsBanner', () => ({ TalentStatsBanner: () => null }))
vi.mock('./VivierIntro', () => ({ VivierIntro: () => null }))
vi.mock('./MissingExpertiseLink', () => ({ MissingExpertiseLink: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const { ConsultantsPage } = await import('./ConsultantsPage')

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConsultantsPage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  search.mockReturnValue({})
  matchPanelProps.mockClear()
})

describe('#2872 (#2367.6) — ?matchProjectId= présélectionne l’affaire du panneau', () => {
  it('sans le paramètre, aucune affaire n’est présélectionnée — panneau ouvert au clic (#1795 etc., jamais depuis l’URL)', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /matching personnalisé/i }))
    expect(matchPanelProps).toHaveBeenCalledWith(expect.objectContaining({ selectedId: null }))
  })

  it('avec le paramètre, l’affaire est présélectionnée dès que le panneau s’ouvre', () => {
    search.mockReturnValue({ matchProjectId: '22222222-2222-4222-8222-222222222222' })
    draw()
    // Le panneau reste FERMÉ à l'arrivée (#1795/#1808/#1809/#1813) : la
    // présélection ne se vérifie qu'une fois ouvert, jamais en l'ouvrant
    // elle-même depuis l'URL.
    expect(screen.getByRole('button', { name: /matching personnalisé/i })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: /matching personnalisé/i }))
    expect(matchPanelProps).toHaveBeenCalledWith(
      expect.objectContaining({ selectedId: '22222222-2222-4222-8222-222222222222' }),
    )
  })
})
