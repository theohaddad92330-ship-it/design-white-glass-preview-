import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * L'état vide du vivier NOMME le filtre bloquant (manque A du 30/08) — même
 * esprit que `emptyListAction` côté comptes.
 *
 * Avant ce lot, l'écran ne distinguait que « une recherche est posée » de
 * « aucune » : un recruteur qui tapait une zone trop précise recevait le même
 * message générique qu'un vivier réellement vide, sans savoir LEQUEL de ses
 * filtres écartait tout le monde.
 */
const searchResult: { data: { items: unknown[]; total: number; page: number; limit: number }; isLoading: boolean } = {
  data: { items: [], total: 0, page: 1, limit: 25 },
  isLoading: false,
}
const archivedTotal = { current: 0 }
const searchSpy = vi.fn()

// #3781 — l'écran lit `useIsDemo` (le bouton « Supprimer définitivement » n'existe pas en salle partagée).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/matching/api', () => ({ matchingApi: { inverse: vi.fn() } }))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({ useOpenNeeds: () => ({ data: undefined }) }))
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
  // #2662.2 — le geste EN LOT, hors sujet ici (ce fichier teste l'état vide).
  useArchiveTalentsBulk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Toujours vide, quelle que soit la requête : ce fichier teste l'ÉTAT VIDE,
  // pas la recherche réelle — qui a ses propres tests (`hooks.ts`, `api.ts`).
  useTalentSearch: (query: { includeArchived?: boolean }, options?: { enabled?: boolean }) => {
    searchSpy(query, options)
    return query.includeArchived && options
      ? { data: { items: [], total: archivedTotal.current, page: 1, limit: 1 }, isLoading: false }
      : searchResult
  },
}))
vi.mock('./CvDropZone', () => ({ CvDropZone: () => null }))
vi.mock('./VivierTable', () => ({ VivierTable: () => <div data-testid="vivier-table" /> }))
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
// #4500 — la modale de filtres monte « Mes vues » (`SavedTalentViews`, ses tests dédiés) : hors sujet ici.
vi.mock('./SavedTalentViews', () => ({ SavedTalentViews: () => null }))
vi.mock('./ConsultantFormDialog', () => ({ ConsultantFormDialog: () => null }))
vi.mock('./VivierAddDialog', () => ({ VivierAddDialog: () => null }))
vi.mock('./TalentStatsBanner', () => ({ TalentStatsBanner: () => <div data-testid="stats-banner" /> }))
// #2182.4/.5/.12/.14/.15 — l'entête personnalisé, hors sujet ici (useFirstName exige un SessionProvider).
vi.mock('./VivierIntro', () => ({ VivierIntro: () => null }))
// Le panneau « expertise manquante » (PDF 4 §8.4) est une lecture À PART : il ne
// touche ni la liste ni les filtres que ces tests mesurent.
vi.mock('./MissingExpertiseLink', () => ({ MissingExpertiseLink: () => null }))
vi.mock('./NeedsMatchRail', () => ({ NeedsMatchRail: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/hygiene/HygieneBadge', () => ({ HygieneBadge: () => <div data-testid="hygiene-badge" /> }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { ConsultantsPage } = await import('./ConsultantsPage')

function draw() {
  return render(<ConsultantsPage />)
}

describe('ConsultantsPage — l’état vide nomme le filtre bloquant', () => {
  beforeEach(() => {
    cleanup()
    archivedTotal.current = 0
    searchSpy.mockClear()
  })

  it('#3488 — vivier actif vide MAIS profils archivés : on le DIT, jamais « vivier vide »', () => {
    archivedTotal.current = 8
    draw()
    expect(screen.getByText('Aucun talent actif — 8 profils archivés')).toBeInTheDocument()
    expect(screen.queryByText('Ton vivier est vide')).not.toBeInTheDocument()
    expect(screen.getAllByText('Afficher les archivés').length).toBeGreaterThan(0)
  })

  // #3488 (recette 02/10) — « 0 · 0 · non mesuré » et « aucun consultant dans ton espace » restaient affichés
  // au-dessus du message « Aucun talent actif — N profils archivés » : ils le contredisent, ils se taisent.
  it('#3488 — vivier actif vide + archivés : ni bandeau KPI ni fiche d’hygiène, le message d’état vide suffit', () => {
    archivedTotal.current = 32
    draw()
    expect(screen.getByText('Aucun talent actif — 32 profils archivés')).toBeInTheDocument()
    expect(screen.queryByTestId('stats-banner')).toBeNull()
    expect(screen.queryByTestId('hygiene-badge')).toBeNull()
  })

  // #3488 (recette Y20) — « Vivier = 1 profil » (un candidat sans nom) alors que Positionnements nomme
  // 9 profils : ils sont ARCHIVÉS, et l'écran ne le disait que si le vivier actif était vide.
  it('#3488 (Y20) — vivier actif non vide MAIS profils archivés : une ligne les nomme et offre de les afficher', () => {
    searchResult.data = { items: [{ id: 'c1' }], total: 1, page: 1, limit: 25 }
    archivedTotal.current = 33
    draw()
    expect(screen.getByTestId('vivier-table')).toBeInTheDocument()
    // Refonte Théo — le pied de liste nomme les archivés non listés, avec leur geste.
    expect(screen.getByRole('button', { name: 'Afficher les archivés (32)' })).toBeInTheDocument()
    searchResult.data = { items: [], total: 0, page: 1, limit: 25 }
  })

  it('#3488 (Y20) — aucun archivé : aucune ligne de plus', () => {
    searchResult.data = { items: [{ id: 'c1' }], total: 1, page: 1, limit: 25 }
    archivedTotal.current = 1
    draw()
    expect(screen.queryByText(/ne sont pas listés|n’est pas listé/)).not.toBeInTheDocument()
    searchResult.data = { items: [], total: 0, page: 1, limit: 25 }
  })

  it('#3488 / #4500 — vivier réellement vide (aucun archivé) : l’état vide parle, sans encarts ni pastille d’hygiène', () => {
    archivedTotal.current = 0
    draw()
    expect(screen.getByText('Ton vivier est vide')).toBeInTheDocument()
    // #4500 (Louis 23/10/2026) — les cinq encarts et la pastille « disponibilité inconnue » ont quitté le Vivier.
    expect(screen.queryByTestId('stats-banner')).toBeNull()
    expect(screen.queryByTestId('hygiene-badge')).toBeNull()
  })

  it('#3488 — la sonde des archivés ne part que si le vivier actif est vide sans filtre', () => {
    draw()
    const probes = searchSpy.mock.calls.filter(([q]) => q.includeArchived)
    expect(probes.every(([, options]) => options?.enabled === true)).toBe(true)
    fireEvent.change(screen.getByLabelText('Rechercher un talent'), { target: { value: 'Lyon' } })
    const afterFilter = searchSpy.mock.calls.at(-1)
    expect(afterFilter?.[1]).toEqual({ enabled: false })
  })

  it('aucun filtre posé : le message générique « vivier vide »', () => {
    draw()
    expect(screen.getByText('Ton vivier est vide')).toBeInTheDocument()
  })

  it('EXACTEMENT un filtre posé : il est NOMMÉ, avec un geste pour le retirer seul', () => {
    draw()
    fireEvent.change(screen.getByLabelText('Rechercher un talent'), { target: { value: 'Lyon' } })

    expect(screen.getByText('Aucun talent ne correspond à « Rechercher un talent : Lyon »')).toBeInTheDocument()
    expect(screen.queryByText('Ton vivier est vide')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Retirer ce filtre'))

    expect(screen.getByLabelText('Rechercher un talent')).toHaveValue('')
    expect(screen.getByText('Ton vivier est vide')).toBeInTheDocument()
  })

  it('PLUSIEURS filtres posés : on ne sait plus lequel nommer seul, le message générique reste', () => {
    draw()
    fireEvent.change(screen.getByLabelText('Rechercher un talent'), { target: { value: 'Lyon' } })
    // #4500 — le secteur se pose dans la modale « Filtrer mon vivier ».
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }))
    fireEvent.change(screen.getByLabelText('Secteur'), { target: { value: 'Banque' } })
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))

    expect(screen.getByText('Aucun talent ne correspond')).toBeInTheDocument()
    expect(screen.queryByText(/Rechercher un talent : Lyon/)).not.toBeInTheDocument()
  })

  it('#2958.104 — PLUSIEURS filtres sans résultat : « Vider la recherche » rend le vivier entier, jamais un cul-de-sac', () => {
    draw()
    expect(screen.queryByRole('button', { name: 'Vider la recherche' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Rechercher un talent'), { target: { value: 'Lyon' } })
    // #4500 — le secteur se pose dans la modale « Filtrer mon vivier ».
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }))
    fireEvent.change(screen.getByLabelText('Secteur'), { target: { value: 'Banque' } })
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))

    fireEvent.click(screen.getByRole('button', { name: 'Vider la recherche' }))

    expect(screen.getByLabelText('Rechercher un talent')).toHaveValue('')
    expect(screen.getByText('Ton vivier est vide')).toBeInTheDocument()
  })
})
