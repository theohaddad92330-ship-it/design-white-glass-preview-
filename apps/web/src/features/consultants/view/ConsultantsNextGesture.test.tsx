import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FORM, type ConsultantFormState } from '../lib/consultantForm'

/**
 * LE GESTE QUI SUIT L'ENREGISTREMENT (BEL-BO-003, PDF-02 §3.4).
 *
 * « À l'enregistrement, l'écran ne renvoie pas à une liste. Il propose : "3
 * besoins ouverts correspondent à ce profil. Je lance le rapprochement ?" C'est
 * ce qui transforme une saisie en action. Une fiche créée et abandonnée est une
 * saisie perdue. »
 *
 * L'écran affichait un toast et fermait le dialogue. Le moteur existait pourtant
 * (`POST /consultants/:id/match-inverse`) et n'était atteignable que depuis la
 * fiche du talent, deux clics plus loin.
 *
 * ⚠️ Le nombre annoncé AVANT le clic est celui des besoins OUVERTS, pas des
 * besoins « qui correspondent » : la correspondance ne se connaît qu'après le
 * rapprochement, et l'annoncer avant serait un chiffre inventé.
 */
const inverse = vi.fn()
const openNeeds = vi.fn()
const createMutate = vi.fn()

// #3781 — l'écran lit `useIsDemo` (le bouton « Supprimer définitivement » n'existe pas en salle partagée).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/matching/api', () => ({ matchingApi: { inverse: (...args: unknown[]) => inverse(...args) } }))
vi.mock('@/features/projects/open-needs/api', () => ({
  openNeedsApi: { list: () => openNeeds() },
  openNeedsKeys: { all: ['open-needs'], list: (query: unknown) => ['open-needs', 'list', query] },
}))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => Promise.resolve({ lines: [] }) } }))
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
  useCreateConsultant: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEraseTalents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTalentFavorite: () => ({ mutate: vi.fn(), isPending: false }),
  // #2662.2 — le geste EN LOT, hors sujet ici (ce fichier teste le geste après enregistrement).
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
vi.mock('./ConsultantMatchPanel', () => ({ ConsultantMatchPanel: () => null }))
vi.mock('./TalentDeleteDialog', () => ({ TalentDeleteDialog: () => null }))
vi.mock('./TalentSkillsDialog', () => ({ TalentSkillsDialog: () => null }))
vi.mock('./TalentStatsBanner', () => ({ TalentStatsBanner: () => null }))
// #2182.4/.5/.12/.14/.15 — l'entête personnalisé, hors sujet ici (useFirstName exige un SessionProvider).
vi.mock('./VivierIntro', () => ({ VivierIntro: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div> }))
// Le panneau « expertise manquante » (PDF 4 §8.4) est une lecture À PART : il ne
// touche ni la liste ni les filtres que ces tests mesurent.
vi.mock('./MissingExpertiseLink', () => ({ MissingExpertiseLink: () => null }))
vi.mock('./NeedsMatchRail', () => ({ NeedsMatchRail: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Le dialogue est réduit à son bouton d'envoi : ce fichier teste ce qui se
// passe APRÈS, pas la saisie — qui a ses propres tests.
vi.mock('./ConsultantFormDialog', () => ({ ConsultantFormDialog: () => null }))
vi.mock('./VivierAddDialog', () => ({
  VivierAddDialog: ({
    open,
    onSubmit,
  }: {
    open: boolean
    onSubmit: (form: ConsultantFormState, options: { match: boolean }) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onSubmit({ ...EMPTY_FORM, full_name: 'Nadia Fournier' } satisfies ConsultantFormState, { match: false })
        }
      >
        envoyer-le-formulaire
      </button>
    ) : null,
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

async function createTalent() {
  draw()
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter un profil' }))
  fireEvent.click(await screen.findByRole('button', { name: 'envoyer-le-formulaire' }))
}

describe('vivier — le geste qui suit l’enregistrement', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    createMutate.mockResolvedValue({ id: 'c-1', full_name: 'Nadia Fournier' })
    openNeeds.mockResolvedValue({ items: [], total: 0, counters: { total: 3 } })
    inverse.mockResolvedValue({ evaluatedCount: 0, needs: [] })
  })

  it('PROPOSE le rapprochement au lieu de refermer sur une liste', async () => {
    await createTalent()
    expect(await screen.findByRole('button', { name: /Lancer le rapprochement/ })).toBeInTheDocument()
  })

  it('annonce le nombre de besoins OUVERTS, mesuré — pas une correspondance devinée', async () => {
    await createTalent()
    expect(await screen.findByText(/3 besoins ouverts/)).toBeInTheDocument()
  })

  it('ne compte PAS « 0 » tant que le chiffre n’est pas arrivé', async () => {
    // Un zéro de chargement se lit comme un vrai zéro : « aucun besoin ouvert »
    // découragerait exactement le geste qu'on vient de proposer.
    openNeeds.mockReturnValue(new Promise(() => {}))
    await createTalent()
    expect(await screen.findByRole('button', { name: /Lancer le rapprochement/ })).toBeInTheDocument()
    expect(screen.queryByText(/0 besoins ouverts/)).not.toBeInTheDocument()
  })

  it('ne dit plus rien du coût avant le clic (#4463) — ni « aucun crédit », ni un nombre', async () => {
    await createTalent()
    expect(await screen.findByRole('button', { name: /Lancer le rapprochement/ })).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  it('lance le rapprochement sur la fiche qui vient d’être créée', async () => {
    await createTalent()
    fireEvent.click(await screen.findByRole('button', { name: /Lancer le rapprochement/ }))
    await waitFor(() => expect(inverse).toHaveBeenCalledWith('c-1', 'all'))
  })

  it('rend le verdict du SERVEUR, et NOMME ce qui n’a pas pu être évalué', async () => {
    inverse.mockResolvedValue({
      evaluatedCount: 4,
      needs: [
        { need: { needId: 'n1' }, result: { bucket: 'recommended' } },
        { need: { needId: 'n2' }, result: { bucket: 'recommended' } },
        { need: { needId: 'n3' }, result: { bucket: 'excluded' } },
        { need: { needId: 'n4' }, result: { bucket: 'not_evaluable' } },
      ],
    })
    await createTalent()
    fireEvent.click(await screen.findByRole('button', { name: /Lancer le rapprochement/ }))
    expect(await screen.findByText(/2 besoins? recommandés? sur 4/)).toBeInTheDocument()
    expect(screen.getByText(/1 n’a pas pu être évalué/)).toBeInTheDocument()
  })

  it('se retire quand on choisit « Plus tard »', async () => {
    await createTalent()
    fireEvent.click(await screen.findByRole('button', { name: 'Plus tard' }))
    expect(screen.queryByRole('button', { name: /Lancer le rapprochement/ })).not.toBeInTheDocument()
  })

  it('ne propose RIEN après une simple modification — la saisie n’est pas neuve', async () => {
    draw()
    // Aucune création : le geste ne doit pas s'afficher tout seul au chargement.
    expect(screen.queryByRole('button', { name: /Lancer le rapprochement/ })).not.toBeInTheDocument()
  })
})
