import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  useCvAutoReadStatus: () => ({ data: { unread: 0, progress: null, failed: [] } }),
  useCvAutoReadRetryFailed: () => ({ isPending: false, isError: false, mutate: vi.fn(), error: null }),
  useTalentStats: () => ({ data: undefined }),
  useConsultant: () => ({ data: undefined }),
  useCreateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEraseTalents: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTalentFavorite: () => ({ mutate: vi.fn(), isPending: false }),
  // #2662.2 — le geste EN LOT, hors sujet ici (ce fichier teste la barre d'outils).
  useArchiveTalentsBulk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTalentSearch: () => ({ data: { items: [], total: 0, page: 1, limit: 25 }, isLoading: false }),
  // `ConsultantsPage` rend `CvCsvImportDialog` (non mocké ici), qui appelle ce
  // hook au montage — sans lui, `useCvCsvImport` vaut `undefined` et l'appel
  // fait planter le rendu. Même forme que `CvCsvImportDialog.test.tsx`.
  useCvCsvImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #4500 — la modale de filtres monte « Mes vues » (`SavedTalentViews`, ses tests dédiés) : hors sujet ici.
vi.mock('./SavedTalentViews', () => ({ SavedTalentViews: () => null }))
vi.mock('./ConsultantFormDialog', () => ({ ConsultantFormDialog: () => null }))
vi.mock('./VivierAddDialog', () => ({ VivierAddDialog: () => null }))
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
vi.mock('./TalentStatsBanner', () => ({ TalentStatsBanner: () => null }))
// #2182.4/.5/.12/.14/.15 — l'entête personnalisé, hors sujet ici (useFirstName exige un SessionProvider).
// Refonte Théo — l'intro porte les actions de l'en-tête (Ajouter un profil) : on rend le seul emplacement.
vi.mock('./VivierIntro', () => ({ VivierIntro: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div> }))
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

afterEach(() => cleanup())

describe('vivier — la barre d’outils ne double pas l’onglet', () => {
  it('ne nomme « À recontacter » qu’UNE fois — le raccourci du corps, jamais un second bouton', () => {
    // #2152.39/.40, #2182.1/.2 (16/09/2026) — la barre des vues du Vivier vit
    // MAINTENANT dans le corps de la page : « Vivier », « Positionnements » et
    // « À réveiller » (onglet `nav:tabs.reactivation`) ne sont plus des
    // onglets de SECTION, ce sont les vues d'une page unique.
    //
    // ⚠️ #2152.45 (23/09/2026, `packages/contracts/talent.ts` +
    // `consultants.json`) a renommé « Dormants » en « À recontacter » pour LE
    // RACCOURCI de vue rapide (`views.dormant`, ce fichier) et le segment
    // homonyme du pool de réactivation — même seuil de six mois, un SEUL
    // consommateur par écran (GA-26), les deux écrans étant mutuellement
    // exclusifs. Une tentative du 24/09/2026 de renommer AUSSI l'onglet
    // `nav:tabs.reactivation` en « À recontacter » a réintroduit le doublon
    // que la loi 4 du tome 7 interdit — deux boutons, un seul mot, sur le
    // MÊME écran cette fois (l'onglet est TOUJOURS affiché à côté du
    // raccourci). Corrigé en laissant l'onglet sous son propre nom
    // (« À réveiller » / « To reactivate ») : le raccourci reste le SEUL
    // endroit qui nomme « À recontacter ».
    draw()
    // #4500 (refonte V22) — les vues rapides sont LE sélecteur « Vue rapide » de la
    // modale « Filtrer mon vivier » : « À recontacter » en est une option, jamais
    // un bouton de plus.
    expect(screen.queryAllByRole('button', { name: /À recontacter/ })).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }))
    expect(screen.getByLabelText('Vue rapide')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /À recontacter/ })).toHaveLength(0)
    // Le bouton d'origine avait sa propre DESTINATION (`/consultants/pool`) :
    // aucun lien ne doit la redonner à côté de la vue.
    expect(screen.queryByRole('link', { name: /recontacter|réveiller/i })).not.toBeInTheDocument()
  })

  it('garde « Ajouter un profil » (libellé de la maquette), seul geste d’ajout', () => {
    draw()
    expect(screen.getByRole('button', { name: 'Ajouter un profil' })).toBeInTheDocument()
  })
})
