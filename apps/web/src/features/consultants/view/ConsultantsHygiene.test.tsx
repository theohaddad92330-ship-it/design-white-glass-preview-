import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le contrôle « consultants à disponibilité inconnue », descendu sur le vivier.
 *
 * C'est bien ici que le geste tombe : la fiche porte le champ « Disponibilité »,
 * et le crayon de chaque ligne l'ouvre. Sur Pilotage on ne pouvait que le lire.
 *
 * Le seuil de ce contrôle est une PART (30 %) : la pastille rend donc « n sur m »
 * comme le cockpit, avec les nombres du serveur et aucun recalcul.
 */

const hygiene = vi.fn()
// #3781 — l'écran lit `useIsDemo` (le bouton « Supprimer définitivement » n'existe pas en salle partagée).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => hygiene() } }))

vi.mock('@/routes/consultants/index', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
}))
// c88 (04/10/2026) — le bandeau des CV non lus porte SES hooks ; ce test vise autre chose.
vi.mock('../hooks', () => ({
  useCvAutoReadStatus: () => ({ data: { unread: 0, progress: null, failed: [] } }),
  useCvAutoReadRetryFailed: () => ({ isPending: false, isError: false, mutate: vi.fn(), error: null }),
  useTalentStats: () => ({ data: undefined }),
  // `ConsultantsPage` rend `CvCsvImportDialog` (non mocké ici), qui appelle ce
  // hook au montage. Même forme que `ConsultantsIdentity.test.tsx`.
  useCvCsvImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConsultant: () => ({ data: undefined }),
  useCreateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEraseTalents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTalentFavorite: () => ({ mutate: vi.fn(), isPending: false }),
  // #2662.2 — le geste EN LOT, hors sujet ici (ce fichier teste la pastille d'hygiène).
  useArchiveTalentsBulk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTalentSearch: () => ({ data: { items: [], total: 0, page: 1, limit: 25 }, isLoading: false }),
}))
vi.mock('./CvDropZone', () => ({ CvDropZone: () => null }))
// #2569.1 / #2568.1 — les deux gestes d'import en lot, hors sujet ici.
vi.mock('./CvZipImportDialog', () => ({ CvZipImportDialog: () => null }))
vi.mock('./CvMailImportDialog', () => ({ CvMailImportDialog: () => null }))
// #2326.7/.8/.9 (épopée #2794) — disponibilités et export ATS, hors sujet ici.
vi.mock('./AvailabilityImportDialog', () => ({ AvailabilityImportDialog: () => null }))
vi.mock('./AtsExportButton', () => ({ AtsExportButton: () => null }))
// #1952.6 (épopée #2844) — même raison d'être : hors sujet ici.
vi.mock('./BulkExportButton', () => ({ BulkExportButton: () => null }))
vi.mock('./ConsultantFormDialog', () => ({ ConsultantFormDialog: () => null }))
vi.mock('./VivierAddDialog', () => ({ VivierAddDialog: () => null }))
vi.mock('./ConsultantMatchPanel', () => ({ ConsultantMatchPanel: () => null }))
vi.mock('./TalentDeleteDialog', () => ({ TalentDeleteDialog: () => null }))
vi.mock('./TalentSkillsDialog', () => ({ TalentSkillsDialog: () => null }))
vi.mock('./TalentStatsBanner', () => ({ TalentStatsBanner: () => null }))
// #2182.4/.5/.12/.14/.15 — l'entête personnalisé, hors sujet ici (useFirstName exige un SessionProvider).
vi.mock('./VivierIntro', () => ({ VivierIntro: () => null }))
// Le panneau « expertise manquante » (PDF 4 §8.4) est une lecture À PART : il ne
// touche ni la liste ni les filtres que ces tests mesurent.
vi.mock('./MissingExpertiseLink', () => ({ MissingExpertiseLink: () => null }))
vi.mock('./NeedsMatchRail', () => ({ NeedsMatchRail: () => null }))
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

/**
 * #4500 (Louis 23/10/2026, refonte V22) — le bandeau « N sur M consultants à disponibilité inconnue · K candidats non
 * comptés… » QUITTE le Vivier. Le contrôle vit au cockpit (Pilotage › qualité des données) ; l'écran ne le lit même
 * plus — aucune requête d'hygiène ne part du Vivier.
 */
describe('vivier — la pastille d’hygiène a quitté l’écran (#4500)', () => {
  beforeEach(() => {
    cleanup()
    hygiene.mockReset()
  })

  it('même avec des consultants à disponibilité inconnue, AUCUNE pastille, et aucune lecture d’hygiène', async () => {
    hygiene.mockResolvedValue({
      lines: [{ key: 'talents_unknown_availability', count: 12, total: 30, link: '/consultants/pool' }],
    })
    const { container } = draw()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByText(/disponibilité inconnue/)).not.toBeInTheDocument()
    expect(screen.queryByText('12 sur 30')).not.toBeInTheDocument()
    expect(screen.queryByText(/non comptés?/)).not.toBeInTheDocument()
    expect(container.querySelector('[data-hygiene-state]')).toBeNull()
    expect(hygiene).not.toHaveBeenCalled()
  })
})
