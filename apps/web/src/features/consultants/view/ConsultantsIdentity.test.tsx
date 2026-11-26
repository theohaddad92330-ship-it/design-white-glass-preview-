import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { TalentRow } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Les deux défauts vus en PRODUCTION le 30/08 sur l'écran Vivier.
 *
 *  1. une fiche affichée sous son NOM DE FICHIER
 *     (`cv_anonyme_louis_ai-engineer-node_gw`) là où l'écran attend le nom
 *     d'une personne ;
 *  2. une pastille « 1 » NUE en haut à gauche, sans un mot pour dire ce
 *     qu'elle compte — quand `/pilotage` écrit « 3 alertes » et
 *     `/pilotage/qualite` « 4 contrôles à traiter ».
 */

const search = vi.fn(() => ({}) as { q?: string; new?: boolean })
const talents = vi.fn(() => ({
  data: { items: [] as TalentRow[], total: 0, page: 1, limit: 25 },
  isLoading: false,
}))

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
  useConsultant: () => ({ data: undefined }),
  useCreateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEraseTalents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTalentFavorite: () => ({ mutate: vi.fn(), isPending: false }),
  // #2662.2 — le geste EN LOT, hors sujet ici (ce fichier teste l'identité d'une fiche).
  useArchiveTalentsBulk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTalentSearch: () => talents(),
  // `ConsultantsPage` rend `CvCsvImportDialog` (non mocké ici), qui appelle ce
  // hook au montage — sans lui, `useCvCsvImport` vaut `undefined` et l'appel
  // fait planter le rendu. Même forme que `CvCsvImportDialog.test.tsx`.
  useCvCsvImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
vi.mock('./TalentPlacementsChip', () => ({ TalentPlacementsChip: () => null }))
vi.mock('./TalentStatsBanner', () => ({ TalentStatsBanner: () => null }))
// #2182.4/.5/.12/.14/.15 — l'entête personnalisé, hors sujet ici (useFirstName exige un SessionProvider).
vi.mock('./VivierIntro', () => ({ VivierIntro: () => null }))
// Le panneau « expertise manquante » (PDF 4 §8.4) est une lecture À PART : il ne
// touche ni la liste ni les filtres que ces tests mesurent.
vi.mock('./MissingExpertiseLink', () => ({ MissingExpertiseLink: () => null }))
vi.mock('./NeedsMatchRail', () => ({ NeedsMatchRail: () => null }))
// Le signet d'une ligne appelle `useSession()`, qui exige un `SessionProvider`
// que ce test ne monte pas — hors sujet ici, qui vérifie l'affichage du nom.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, pageTitleBadge }: { children: React.ReactNode; pageTitleBadge?: React.ReactNode }) => (
    <div>
      <header data-testid="page-badge">{pageTitleBadge}</header>
      {children}
    </div>
  ),
}))

const { ConsultantsPage } = await import('./ConsultantsPage')

/** Une ligne du vivier, complète — l'écran en lit une douzaine de champs. */
function row(overrides: Partial<TalentRow> = {}): TalentRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'candidate',
    fullName: 'Yanis Berthier',
    title: 'AI Engineer',
    seniority: 'inconnu',
    declaredAvailability: 'inconnu',
    staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: null,
    financeVisible: false,
    contractType: 'cdi',
    engagementKind: 'inconnu',
    zones: [],
    lastMission: null,
    submissions: { open: 0, total: 0 },
    source: 'cv',
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'needs_review',
    topSkills: [],
    skillCount: 0,
    hasCv: false,
    workMode: null,
    updatedAt: '2026-08-30T08:00:00.000Z',
    ...overrides,
  }
}

function draw(items: TalentRow[], total = items.length) {
  talents.mockReturnValue({ data: { items, total, page: 1, limit: 25 }, isLoading: false })
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
})

describe('vivier — une fiche sans nom le DIT', () => {
  const FILE_NAME = 'cv_anonyme_louis_ai-engineer-node_gw'

  it('n’affiche JAMAIS le nom de fichier à la place du nom', () => {
    draw([row({ fullName: FILE_NAME })])
    // La forme exacte vue en production : l'identifiant, seul, en tête de fiche.
    expect(screen.queryByText(FILE_NAME)).toBeNull()
    expect(screen.getByText('Nom non renseigné')).toBeInTheDocument()
  })

  it('garde le fichier comme REPÈRE, annoncé comme un fichier', () => {
    // Sans lui, deux fiches sans nom deviennent indistinguables — et une fiche
    // qu'on ne sait pas retrouver est une fiche perdue.
    draw([row({ fullName: FILE_NAME })])
    expect(screen.getByText(/Fichier déposé/)).toHaveTextContent(FILE_NAME)
  })

  it('affiche le nom quand c’en est un — la correction n’efface personne', () => {
    draw([row({ fullName: 'Yanis Berthier' })])
    expect(screen.getByText('Yanis Berthier')).toBeInTheDocument()
    expect(screen.queryByText('Nom non renseigné')).toBeNull()
    expect(screen.queryByText(/Fichier déposé/)).toBeNull()
  })

  it('dit l’absence même quand la fiche ne porte rien du tout', () => {
    draw([row({ fullName: '   ' })])
    expect(screen.getByText('Nom non renseigné')).toBeInTheDocument()
    // Rien à montrer comme repère : on n'invente pas de numéro.
    expect(screen.queryByText(/Fichier déposé/)).toBeNull()
  })
})

describe('vivier — le compteur dit ce qu’il compte', () => {
  // #1802 — « supprime cette ligne » : sans filtre, cette pastille redisait
  // MOT POUR MOT et CHIFFRE POUR CHIFFRE ce que `TalentStatsBanner` affiche
  // trois centimètres plus bas (« Talents dans le vivier »). `total` (le
  // compte de la recherche courante, sans filtre) et `stats.total` (la même
  // population, non archivée) coïncident alors — loi 4 du tome 7 : rien
  // n'apparaît deux fois sous la même forme avec le même contenu.
  it('ne redit RIEN sans filtre — le total du vivier est déjà porté par la tuile de statistiques', () => {
    draw([row()], 1)
    expect(screen.getByTestId('page-badge').textContent).toBe('')
  })

  it('dit que le compte suit les FILTRES quand il y en a', () => {
    // `total` est le compte de la recherche COURANTE, pas du vivier entier :
    // l'annoncer « au vivier » sous un filtre serait un compteur qui ment.
    search.mockReturnValue({ q: 'java' })
    draw([row()], 1)
    expect(screen.getByTestId('page-badge')).toHaveTextContent('1 profil trouvé')
  })

  it('ne montre aucune pastille quand il n’y a rien à compter', () => {
    // Pas de « 0 profil » : un compteur à zéro présenté comme une mesure ferait
    // chercher quelque chose qui n'existe pas. L'état vide a déjà sa phrase.
    draw([], 0)
    expect(screen.getByTestId('page-badge').textContent).toBe('')
  })
})
