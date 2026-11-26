import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * #1803 — « supprime ce bouton, on a déjà accès au vivier depuis le
 * sélecteur d'onglet du dessus ».
 *
 * Mesuré en production le 09/09/2026 : la barre d'onglets rend
 * « Vivier · Positionnements · À réveiller » (`components/navigation/
 * sections.ts`, section `talents`, tabs `pool` / `submissions` /
 * `reactivation`), et le corps de la page rendait EN PLUS un bouton
 * « À réveiller » vers la MÊME route (`/consultants/pool`), juste à côté de
 * « Ajouter un consultant ». Même destination, deux commandes — loi 4 du
 * tome 7 : rien n'apparaît deux fois sous la même forme avec le même
 * contenu. L'onglet reste seul à porter ce geste.
 */
const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'consultant',
  fullName: 'Inès Kaczmarek',
  title: 'Consultante sécurité applicative',
  seniority: 'senior',
  declaredAvailability: 'immediate',
  staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-10-30', assignments: 1 },
  tjm: null,
  financeVisible: false,
  contractType: 'cdi',
  engagementKind: 'salarie',
  zones: ['Paris'],
  lastMission: { label: null, accountName: 'Thales', endsOn: '2026-10-30', startsOn: '2026-01-05' },
  declaredAvailableFrom: null,
  availabilityCheckedAt: '2026-10-16T08:00:00.000Z',
  provenSkillCount: 1,
  ownerName: 'Maëlle Lorquin',
  submissions: { open: 1, total: 2 },
  source: null,
  lastContactAt: null,
  archivedAt: null,
  reviewStatus: 'qualified',
  topSkills: [{ skill: 'owasp', label: 'OWASP', level: 'expert', source: 'cv' }],
  skillCount: 1,
  hasCv: true,
  workMode: 'hybride',
  updatedAt: '2026-10-16T00:00:00.000Z',
}
const state = vi.hoisted(() => ({ isError: false, refetch: () => {} }))
function search(query: { reviewStatus?: string }) {
  if (query.reviewStatus === 'needs_review') {
    return { data: { items: [], total: 0, page: 1, limit: 50 }, isLoading: false, isError: false }
  }
  return {
    data: { items: [ROW], total: 1, page: 1, limit: 25 },
    isLoading: false,
    isError: state.isError,
    refetch: state.refetch,
  }
}

// #3781 — l'écran lit `useIsDemo` (le bouton « Supprimer définitivement » n'existe pas en salle partagée).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => Promise.reject(new Error('403')) } }))
vi.mock('@/routes/consultants/index', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))
// c88 (04/10/2026) — le bandeau des CV non lus porte SES hooks ; ce test vise autre chose.
vi.mock('../hooks', () => ({
  useCvAutoReadStatus: () => ({
    data: { unread: 0, progress: { read: 0, total: 81 }, failed: [], readThisWeek: { count: 2, names: [] } },
  }),
  useCvAutoReadRetryFailed: () => ({ isPending: false, isError: false, mutate: vi.fn(), error: null }),
  useTalentStats: () => ({ data: undefined }),
  useConsultant: () => ({ data: undefined }),
  useCreateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEraseTalents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // #2662.2 — le geste EN LOT, hors sujet ici (ce fichier teste la barre d'outils).
  useArchiveTalentsBulk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTalentFavorite: () => ({ mutate: vi.fn(), isPending: false }),
  useTalentSearch: (query: { reviewStatus?: string }) => search(query),
  // `ConsultantsPage` rend `CvCsvImportDialog` (non mocké ici), qui appelle ce
  // hook au montage — sans lui, `useCvCsvImport` vaut `undefined` et l'appel
  // fait planter le rendu. Même forme que `CvCsvImportDialog.test.tsx`.
  useCvCsvImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #4501 — l'onglet Recrutement rend le tableau à CINQ colonnes (`RecruitmentStages`) et lit son journal.
vi.mock('../recruitment/recruitment-hooks', () => ({
  useRecruitmentBoard: () => ({
    data: ['to_qualify', 'call_planned', 'qualified', 'on_hold', 'discarded'].map(stage => ({
      stage,
      cards:
        stage === 'qualified'
          ? [
              {
                talentId: '11111111-1111-4111-8111-111111111111',
                fullName: 'Inès Kaczmarek',
                title: 'Consultante sécurité applicative',
                location: 'Paris',
                relation: 'salarie',
                stage,
                stageSince: null,
                reason: null,
                plannedAt: null,
              },
            ]
          : [],
    })),
    isError: false,
  }),
  useChangeRecruitmentStage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #4500 — la modale de filtres monte « Mes vues » (`SavedTalentViews`, ses tests dédiés) : hors sujet ici.
vi.mock('./SavedTalentViews', () => ({ SavedTalentViews: () => null }))
vi.mock('./ConsultantFormDialog', () => ({ ConsultantFormDialog: () => null }))
// #1801.1 — le dépôt de CV a quitté le corps de la page pour la modale
// d'ajout ; mocké ici comme dans les suites voisines, hors sujet pour ce
// fichier qui mesure la barre d'outils.
vi.mock('./CvDropZone', () => ({ CvDropZone: () => null }))
// #2569.1 / #2568.1 — les deux gestes d'import en lot vivent à côté du bouton
// « Ajouter un consultant » ; hors sujet ici, mockés comme leurs voisins.
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
vi.mock('./TalentPlacementsChip', () => ({ TalentPlacementsChip: () => null }))
// #2182.4/.5/.12/.14/.15 — l'entête personnalisé, hors sujet ici (useFirstName exige un SessionProvider).
// Refonte Théo — l'intro porte les actions de l'en-tête (Ajouter un profil) : on rend le seul emplacement.
vi.mock('./VivierIntro', () => ({ VivierIntro: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div> }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => null }))
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

afterEach(() => {
  cleanup()
  state.isError = false
  window.history.replaceState(null, '', '/consultants')
})

/** Les positions dans le document, pour vérifier un ORDRE sans dépendre du balisage. */
function before(a: HTMLElement, b: HTMLElement): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

/**
 * Refonte Théo (maquette `c/talents-vivier`, 23/10/2026) — LA STRUCTURE DE L'ÉCRAN.
 *
 * Cette suite sait dire NON : elle échoue si un bloc change d'ordre, si une
 * colonne de la maquette disparaît, si un onglet empile son voisin, ou si un
 * échec de chargement se lit comme une liste vide.
 */
describe('Vivier — la structure de la maquette Théo', () => {
  it('ordre : en-tête (Ajouter un profil) → onglets → barre (recherche, Filtres, bascule) → synthèse → tableau', () => {
    draw()
    const add = screen.getByRole('button', { name: 'Ajouter un profil' })
    const tab = screen.getByRole('button', { name: 'Recrutement' })
    const searchField = screen.getByLabelText('Rechercher un talent')
    const filters = screen.getByRole('button', { name: 'Filtres' })
    const cards = screen.getByRole('button', { name: 'Cartes' })
    const summary = screen.getByText((_, node) => node?.textContent === '1 personne')
    const table = screen.getByRole('table')
    expect(before(add, tab)).toBe(true)
    expect(before(tab, searchField)).toBe(true)
    expect(before(searchField, filters)).toBe(true)
    expect(before(filters, cards)).toBe(true)
    expect(before(cards, summary)).toBe(true)
    expect(before(summary, table)).toBe(true)
  })

  // #4500 (Louis 23/10/2026) — « trop surchargé, pas lisible » : ce qui QUITTE le Vivier, et où va ce qui reste.
  it('#4500 — ni les cinq encarts, ni « disponibilité inconnue », ni « CV lu avant le correctif » ; les filtres dans la modale', () => {
    draw()
    for (const removed of [
      /Talents dans le vivier/,
      /Disponibles maintenant/,
      /Profils enrichis/,
      /sous le seuil/,
      /Profils favoris/,
      /disponibilité inconnue/,
      /avant le correctif/,
      /Relire les CV incomplets/,
    ]) {
      expect(screen.queryByText(removed)).toBeNull()
    }
    expect(screen.queryByRole('button', { name: 'Relire les CV incomplets' })).toBeNull()
    // La barre ne porte plus les filtres à plat : la vue rapide, « Mes vues » et les compétences vivent dans la modale.
    expect(screen.queryByLabelText('Vues rapides du vivier')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mes vues' })).toBeNull()
    expect(screen.queryByLabelText('Compétences')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }))
    const dialog = screen.getByRole('dialog', { name: 'Filtrer mon vivier' })
    for (const label of ['Vue rapide', 'Compétences', 'Secteur', 'Type de profil', 'Séniorité', 'Ville']) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument()
    }
  })

  // GA-26 — un filtre posé (la recherche) ne fait pas répéter la règle de lecture de la disponibilité par la barre.
  it('#4500 — la règle « déclarée contre planning » se lit UNE fois, même filtre posé', () => {
    draw()
    fireEvent.change(screen.getByLabelText('Rechercher un talent'), { target: { value: 'Inès' } })
    expect(screen.getByRole('button', { name: /Tout effacer/ })).toBeInTheDocument()
    expect(screen.getAllByText(/disponibilité déclarée/i)).toHaveLength(1)
  })

  // #4500.1 / #4500.2 — le bandeau « CV lus » est SUPPRIMÉ de la page (la lecture automatique continue).
  it('#4500.1 — aucun bandeau « CV lus » sous la barre, même quand la lecture a des chiffres', () => {
    draw()
    expect(screen.queryByText(/CV lus cette semaine/)).toBeNull()
    expect(screen.queryByText(/\/ 81 CV lus/)).toBeNull()
  })

  it('les deux onglets de Talents, dans leur ordre (#4528.1)', () => {
    draw()
    const labels = ['Vivier', 'Recrutement'].map(name => screen.getByRole('button', { name }))
    expect(before(labels[0]!, labels[1]!)).toBe(true)
  })

  it('les colonnes de la maquette, dans son ordre', () => {
    draw()
    const headers = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map(cell => cell.textContent?.trim())
      .filter(Boolean)
    // #4500 — EXACTEMENT les colonnes de la maquette (puis la colonne d'actions, nommée pour le lecteur d'écran) :
    // le TJM et la séniorité ont quitté la liste.
    expect(headers).toHaveLength(6)
    expect(headers.slice(0, 5)).toEqual([
      'Personne / expertise',
      'Compétences déclarées',
      'Disponibilité & planning',
      'Localisation',
      'Suivi',
    ])
  })

  it('la ligne de la maquette : score /100 ouvrable avec ses axes, déclaration qui gagne, planning dessous, « Rapprocher »', () => {
    draw()
    const row = within(screen.getByRole('table')).getByText('Inès Kaczmarek').closest('tr')!
    // Le score n'est jamais nu : « 86 /100 · 3 axes sur 4 » dit son nombre d'axes, et s'ouvre sur eux.
    const pill = within(row).getByRole('button', { name: /Voir les axes du score de Inès Kaczmarek/ })
    expect(pill.textContent).toMatch(/^\d+ \/100 · \d axes? sur 4$/)
    fireEvent.click(pill)
    const dialog = screen.getByRole('dialog')
    for (const axis of ['Fiche complète', 'Compétences prouvées', 'Disponibilité confirmée', 'Retours de mission']) {
      expect(within(dialog).getAllByText(new RegExp(axis)).length).toBeGreaterThan(0)
    }
    // « Retours de mission » n'est pas lisible ici : il reste NOMMÉ, jamais compté zéro.
    expect(within(dialog).getByText(/il n’est jamais compté comme zéro/)).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    // Disponibilité & planning : la DÉCLARATION en badge (elle gagne), son jour, puis le planning en ligne secondaire.
    const availability = within(row).getByTestId('vivier-availability')
    expect(within(availability).getByText('Disponible')).toBeInTheDocument()
    expect(within(availability).getByText(/^Déclarée le 16 oct\. 2026 — gagne sur le planning$/)).toBeInTheDocument()
    expect(within(availability).getByText(/^Planning : fin prévue 30 oct\. 2026 · Thales$/)).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: /Rapprocher/ })).toHaveAttribute(
      'href',
      '/consultants/$id/reverse-market',
    )
    // Suivi : les présentations, puis le référent.
    expect(within(row).getByText('2 présentations')).toBeInTheDocument()
    expect(within(row).getByText('Maëlle Lorquin')).toBeInTheDocument()
    expect(within(row).getByText('Hybride')).toBeInTheDocument()
  })

  it('#4501 — « Recrutement » rend le tableau à CINQ colonnes, à la place du vivier', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Recrutement' }))
    const board = screen.getByTestId('recruitment-board')
    const stages = within(board)
      .getAllByRole('heading', { level: 2 })
      .map(heading => heading.textContent)
    expect(stages).toEqual(['À qualifier', 'Échange prévu', 'Qualifié', 'En veille', 'Écartée'])
    // Le compte par colonne, et l'état vide NOMMÉ.
    const qualified = screen.getByRole('region', { name: /^Qualifié/ })
    expect(qualified).toHaveTextContent('Inès Kaczmarek')
    expect(within(qualified).getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /^À qualifier/ })).toHaveTextContent('Aucun profil à cette étape.')
    expect(within(qualified).getByRole('button', { name: /Changer l’étape.*Inès Kaczmarek/ })).toBeInTheDocument()
    // L'ancien tableau à deux colonnes n'existe plus, et le vivier ne s'empile pas dessous.
    expect(screen.queryByRole('table')).toBeNull()
    expect(window.location.hash).toBe('#recrutement')
  })

  it('#4501 — l’en-tête de l’onglet : « Recrutement », sa phrase, « Ajouter un profil » — puis les onglets', () => {
    window.history.replaceState(null, '', '/consultants#recrutement')
    draw()
    const title = screen.getByRole('heading', { level: 1, name: 'Recrutement' })
    expect(
      screen.getByText('La qualification de la personne, indépendamment de ses présentations chez les clients.'),
    ).toBeInTheDocument()
    const add = screen.getByRole('button', { name: 'Ajouter un profil' })
    expect(before(title, add)).toBe(true)
    expect(before(add, screen.getByRole('button', { name: 'Vivier' }))).toBe(true)
    // L'en-tête du vivier (Importer) n'est pas celui de cet onglet.
    expect(screen.queryByRole('button', { name: 'Importer' })).toBeNull()
  })

  it('#4528.1 — Talents garde la personne : deux onglets, aucun « Présentations » ni « Ajouter une présentation »', () => {
    draw()
    expect(screen.getByRole('button', { name: 'Vivier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recrutement' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Présentations' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajouter une présentation' })).toBeNull()
  })

  it('l’ancre `#positionnements` n’ouvre plus d’onglet : le Vivier (la route redirige en amont)', () => {
    window.history.replaceState(null, '', '/consultants#positionnements')
    draw()
    expect(screen.getByRole('button', { name: 'Ajouter un profil' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Présentations' })).toBeNull()
  })

  it('la bascule « Cartes » rend la grille de cartes, avec un lien « Profil »', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    expect(screen.queryByRole('table')).toBeNull()
    const card = screen.getByRole('link', { name: 'Profil' }).closest('li')!
    // La carte de la maquette, dans son ordre : lieu · relation, score ouvrable, disponibilité & planning, « Profil ».
    const place = within(card).getByText('Paris · Salarié')
    const pill = within(card).getByRole('button', { name: /Voir les axes du score de Inès Kaczmarek/ })
    const availability = within(card).getByTestId('vivier-availability')
    expect(before(place, pill) && before(pill, availability)).toBe(true)
    expect(within(availability).getByText(/^Planning : fin prévue 30 oct\. 2026 · Thales$/)).toBeInTheDocument()
  })

  it('un échec de chargement est NOMMÉ, avec « Réessayer » — jamais lu comme un vivier vide', () => {
    state.isError = true
    const refetch = vi.fn()
    state.refetch = refetch
    draw()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Le vivier n’a pas pu être chargé.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }))
    expect(refetch).toHaveBeenCalled()
  })
})
