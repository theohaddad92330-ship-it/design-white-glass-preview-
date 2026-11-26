import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TalentRow } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * #2500 (17/09/2026) — « le tableau est illisible ; replier par défaut le
 * matching personnalisé ; le tableau doit être lisible avec le matching
 * personnalisé ouvert ou non — là ce n'est juste pas utilisable ».
 *
 * Mesure d'abord (lecture du composant) : `ConsultantsPage.tsx` posait
 * `NeedsMatchRail` + `ConsultantMatchPanel` dans un `<aside
 * className="w-full xl:w-96 xl:shrink-0">` monté SANS repli — 384 px pris en
 * permanence à côté du tableau (`min-w-0 flex-1`), qu'il y ait ou non un
 * besoin à matcher. `ConsultantMatchPanel` n'a pas de sortie anticipée : il
 * rend toujours sa carte, même sans sélection.
 *
 * Le patron du dépôt pour « replié à l'arrivée, jamais persisté » est
 * `CollapsedSection` (`components/disclosure/CollapsedSection.tsx`,
 * `defaultOpen` toujours `false`) — copié sur le rail de recherche de
 * Découvrir (#1796.1). Les deux panneaux de matching vont dedans ; l'aside
 * lui-même rétrécit tant que c'est fermé, pour rendre la largeur au tableau.
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
  // `ConsultantsPage` rend `CvCsvImportDialog` (non mocké ici), qui appelle ce
  // hook au montage. Même forme que `ConsultantsIdentity.test.tsx`.
  useCvCsvImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConsultant: () => ({ data: undefined }),
  useCreateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEraseTalents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTalentFavorite: () => ({ mutate: vi.fn(), isPending: false }),
  // #2662.2 — le geste EN LOT, hors sujet ici (ce fichier teste le repli du panneau de matching).
  useArchiveTalentsBulk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTalentSearch: () => talents(),
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
// Marqueurs VISIBLES — contrairement aux suites voisines qui les rendent
// `null`, ce fichier mesure PRÉCISÉMENT quand ce contenu est dans le DOM.
vi.mock('./ConsultantMatchPanel', () => ({ ConsultantMatchPanel: () => <div>MATCH_PANEL_MARKER</div> }))
vi.mock('./NeedsMatchRail', () => ({ NeedsMatchRail: () => <div>NEEDS_RAIL_MARKER</div> }))
vi.mock('./TalentDeleteDialog', () => ({ TalentDeleteDialog: () => null }))
vi.mock('./TalentSkillsDialog', () => ({ TalentSkillsDialog: () => null }))
vi.mock('./TalentPlacementsChip', () => ({ TalentPlacementsChip: () => null }))
vi.mock('./TalentStatsBanner', () => ({ TalentStatsBanner: () => null }))
// #2182.4/.5/.12/.14/.15 — l'entête personnalisé, hors sujet ici (useFirstName exige un SessionProvider).
vi.mock('./VivierIntro', () => ({ VivierIntro: () => null }))
vi.mock('./MissingExpertiseLink', () => ({ MissingExpertiseLink: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const { ConsultantsPage } = await import('./ConsultantsPage')

/** Une ligne minimale — cette suite ne mesure pas les CHAMPS, seulement la mise en page. */
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

function draw(items: TalentRow[] = [row()]) {
  talents.mockReturnValue({ data: { items, total: items.length, page: 1, limit: 25 }, isLoading: false })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConsultantsPage />
    </QueryClientProvider>,
  )
}

afterEach(() => cleanup())

describe('#2500 — le matching personnalisé se replie par défaut', () => {
  it('le panneau est FERMÉ à l’arrivée — son contenu n’est pas dans le DOM', () => {
    draw()
    expect(screen.queryByText('MATCH_PANEL_MARKER')).not.toBeInTheDocument()
    expect(screen.queryByText('NEEDS_RAIL_MARKER')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /matching personnalisé/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('un clic ouvre le panneau — la capacité survit au repli', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /matching personnalisé/i }))
    expect(screen.getByText('MATCH_PANEL_MARKER')).toBeInTheDocument()
    expect(screen.getByText('NEEDS_RAIL_MARKER')).toBeInTheDocument()
  })

  it('colonnes essentielles présentes PANNEAU FERMÉ — nom et disponibilité', () => {
    draw()
    expect(screen.getByText('Personne / expertise')).toBeInTheDocument()
    expect(screen.getByText('Disponibilité & planning')).toBeInTheDocument()
  })

  it('colonnes essentielles présentes PANNEAU OUVERT — le tableau reste lisible', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /matching personnalisé/i }))
    expect(screen.getByText('Personne / expertise')).toBeInTheDocument()
    expect(screen.getByText('Disponibilité & planning')).toBeInTheDocument()
  })
})

/**
 * #2525 — « matching fermé : le tableau occupe tout l'espace. »
 *
 * Mesure d'abord (lecture du composant, avant ce lot) : l'aside portait
 * `xl:w-72` même repliée — 288 px pris en permanence, alors que #2500 n'avait
 * réglé que le CONTENU (l'en-tête seul monté), pas le CONTENEUR. Sait dire
 * NON : sans le correctif, la ligne garde `xl:flex-row` même fermé et l'aside
 * garde une largeur `xl` propre.
 */
describe('#2525 — panneau fermé, le tableau occupe tout l’espace', () => {
  it('la ligne n’est plus scindée en deux colonnes à `xl`', () => {
    const { container } = draw()
    const aside = container.querySelector('aside')
    const row = aside?.parentElement
    expect(row?.className).not.toMatch(/\bxl:flex-row\b/)
  })

  it('l’aside ne réserve plus de largeur `xl` propre', () => {
    const { container } = draw()
    const aside = container.querySelector('aside')
    expect(aside?.className).not.toMatch(/\bxl:w-72\b/)
    expect(aside?.className).not.toMatch(/\bxl:w-96\b/)
  })
})

/**
 * #2526 — « matching ouvert : moins de colonnes s'il le faut, mais rien de
 * coupé. » Ouvert, l'aside REDEVIENT une colonne à côté du tableau — et le
 * tableau se règle alors sur la place qui lui reste (voir
 * `VivierTableHeaderRow.test.tsx` pour le détail des colonnes).
 */
describe('#2526 — panneau ouvert, le tableau redevient compact', () => {
  it('la ligne redevient scindée en deux colonnes à `xl`, l’aside reprend 384 px', () => {
    const { container } = draw()
    fireEvent.click(screen.getByRole('button', { name: /matching personnalisé/i }))
    const aside = container.querySelector('aside')
    const row = aside?.parentElement
    expect(row?.className).toMatch(/\bxl:flex-row\b/)
    expect(aside?.className).toMatch(/\bxl:w-96\b/)
  })

  // #2737 — plus de mode « compact » choisi sur la fenêtre : le tableau MESURE
  // la place que l'aside lui laisse et garde les colonnes qui y tiennent
  // (`vivierColumnsFor`, `vivierTableColumns.test.ts`). La mise en page réelle
  // se mesure dans `e2e/tests/web/vivier-table-layout.spec.ts`.
})
