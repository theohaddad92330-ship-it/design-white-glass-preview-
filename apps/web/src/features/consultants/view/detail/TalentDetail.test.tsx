// Décision Louis 12/10 revient sur c88, délibérément : la revue du CV sert à CORRIGER une fiche déjà qualifiée.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScreenGuideSlotProvider } from '@/components/shell/ScreenGuideSlot'
import type { Consultant, TalentRow } from '@bellum/contracts'
import { chooseOption } from '@/test/select'
import { ApiError } from '@/lib/api-error'

// #4158.23 — la note « déjà proposé » a ses propres tests ; elle lit l'API des garde-fous.
// #4198 (L7) — la zone « Objets liés » lit une requête : sans ce double, ce fichier devrait porter un QueryClientProvider.
// #4051 — la ligne d'origine lit une requête : doublée ici.
vi.mock('./ConsultantImportMark', () => ({ ConsultantImportMark: () => null }))
vi.mock('@/features/records/useRecordLinks', () => ({ useRecordLinks: () => ({ data: undefined }) }))
vi.mock('@/features/team-guardrails/components/AlreadyProposedNote', () => ({ AlreadyProposedNote: () => null }))

/**
 * LA FICHE D'UN TALENT — SA BARRE D'ONGLETS, SON ENTÊTE, ET LE FAIT QU'AUCUN
 * ONGLET NE RENDE UNE PAGE BLANCHE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, EN PRODUCTION (31/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `https://app.bellum-ai.com/consultants/<id>` : les libellés « Documents »,
 * « Dossier », « Disponibilité & TJM » et « Positionnements » se CHEVAUCHAIENT,
 * illisibles.
 *
 * La cause n'était pas le nombre d'onglets, c'était la barre. La fiche montait
 * `TabsList`/`TabsTrigger` (Radix, `packages/ui/src/components/tabs.tsx`) et non
 * `TabNav`, la barre d'onglets du dépôt. Or `TabsTrigger` porte `flex-1`, donc
 * `flex-basis: 0` ET `flex-shrink: 1` : dix onglets se partagent la largeur en
 * parts ÉGALES, chaque part est plus étroite que son libellé, et
 * `whitespace-nowrap` empêche le retour à la ligne — le texte déborde de sa
 * boîte et se superpose au voisin. Aucun `overflow` ne le rattrape :
 * `TabsList` est `w-fit`, pas `overflow-x-auto`.
 *
 * `TabNav` tient exactement l'inverse, et l'a écrit : `shrink-0` sur le
 * CONTENEUR de chaque onglet (« depuis que `min-width: 0` s'applique aux
 * enfants de flex, un conteneur sans lui se comprime sous la largeur de son
 * bouton ») et `overflow-x-auto` sur la barre. La réparation n'était donc pas à
 * écrire : elle était à APPELER. Réparer la barre Radix aurait produit une
 * SECONDE barre d'onglets, qui aurait divergé au premier changement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE, ET COMMENT ELLE SAIT DIRE NON
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. la barre DÉFILE et ses onglets ne se comprimeNT pas (`overflow-x-auto`,
 *     `shrink-0`, aucun `flex-1`) — c'est littéralement la cause mesurée ;
 *  2. les DIX libellés sont rendus, entiers ;
 *  3. chaque onglet monte une région qui DIT quelque chose — une fiche vide de
 *     tout comprise. Un onglet blanc est pire qu'un onglet absent ;
 *  4. l'entête porte la disponibilité DÉRIVÉE, sa contradiction avec le
 *     déclaré, la complétude DÉCOMPOSÉE et les trois gestes de la maquette ;
 *  5. le TJM se RETIRE sans le droit finance — il ne se met jamais à zéro.
 *
 * Le point 1 sait dire NON : remettre `TabsList` fait tomber les trois
 * assertions de classe, et c'est vérifiable en une ligne de `git revert`.
 */

const TALENT_ID = 'c0000000-0000-4000-8000-000000000001'

/** Une fiche VIDE de tout ce qui est facultatif — le pire cas d'un onglet. */
const EMPTY_TALENT = {
  id: TALENT_ID,
  workspace_id: 'w-1',
  kind: 'consultant',
  source: null,
  last_contact_at: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified',
  consent: { givenAt: null, expiresAt: null, basis: null },
  full_name: 'Nadia Berrada',
  title: null,
  seniority: 'senior',
  availability: 'immediate',
  available_from: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie',
  partner_account_id: null,
  email: null,
  phone: null,
  public_profile_url: null,
  contact_visible: true,
  tjm: null,
  finance_visible: false,
  stack: [],
  sectors: [],
  zones: [],
  mobility: null,
  preferences: null,
  references: [],
  languages: [],
  clearances: [],
  wants: null,
  notes: null,
  cv_text: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-08-30T10:00:00.000Z',
} as unknown as Consultant

/** La ligne de vivier correspondante — dérivée, donc « à confirmer ». */
const EMPTY_ROW: TalentRow = {
  id: TALENT_ID,
  kind: 'consultant',
  fullName: 'Nadia Berrada',
  title: null,
  seniority: 'senior',
  declaredAvailability: 'immediate',
  staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
  tjm: null,
  financeVisible: false,
  contractType: 'cdi',
  engagementKind: 'salarie',
  zones: [],
  lastMission: null,
  submissions: { open: 0, total: 0 },
  source: null,
  lastContactAt: null,
  archivedAt: null,
  reviewStatus: 'qualified',
  topSkills: [],
  skillCount: 0,
  hasCv: false,
  workMode: null,
  photoUrl: null,
  updatedAt: '2026-08-30T10:00:00.000Z',
}

let talent: Consultant = EMPTY_TALENT
let row: TalentRow | undefined = EMPTY_ROW
let rowIsError = false
let rowIsLoading = false
// #1687.3 — configurable pour le test de l'état d'erreur d'écran ci-dessous ;
// les tests existants ne la posent jamais, leur comportement est inchangé.
let talentIsError = false
let talentError: unknown = null
// #2327.1 — une fiche qui porte DÉJÀ un document : le pire cas visé n'est pas
// le vide, c'est « il y en a déjà un, et pourtant aucune façon d'en ajouter un
// second ».
let documents: { id: string; filename: string; extractedChars: number; kind?: string }[] = []
// #2185.51 — les brouillons déjà préparés, pour `TalentPrepareMessageDialog`.
let preparedMessages: {
  id: string
  talentId: string
  channel: string
  subject: string | null
  body: string
  preparedByName: string | null
  createdAt: string
}[] = []
const prepareMessageMutateAsync = vi.fn()
// #2185.36 — une fiche qui porte DÉJÀ une compétence datée : le cas qui
// prouve que `lastUsedYear` (existant sur `ConsultantSkill`) atteint l'écran.
let skills: {
  id: string
  skill: string
  rawLabel: string | null
  level: string
  years: number | null
  lastUsedYear: number | null
  source: string
}[] = []
// #2185.50 — les besoins ouverts du portefeuille, pour `TalentAddToNeedDialog`.
let opportunities: { id: string; company_name: string | null; label: string }[] = []
// #4346 — les missions du consultant : « Voir la mission » ne paraît que s'il en a une en cours ou à venir.
let talentMissions: {
  missionId: string
  accountName: string | null
  label: string | null
  startsOn: string | null
  endsOn: string | null
  loadPercent: number
}[] = []
// #4346 — le matching inverse que la fenêtre « Ajouter à un besoin » lit pour proposer d'abord les besoins qui matchent.
const inverseMock = vi.fn()
vi.mock('@/features/matching/api', () => ({ matchingApi: { inverse: (...args: unknown[]) => inverseMock(...args) } }))
const createSubmissionMutateAsync = vi.fn()
// #2185.48 — « Valider disponibilité » réécrit la fiche via ce MÊME mutateur.
const updateConsultantMutateAsync = vi.fn()
// #2185.10 — « Suivi par », désigné depuis l'entête.
const setOwnerMutateAsync = vi.fn()
// #2185.42 — les positionnements de la fiche, pour l'onglet Positionnements.
let submissionItems: {
  id: string
  accountName: string | null
  projectLabel: string | null
  stage: string
  outcomeReason: string | null
  projectId?: string
}[] = []

// #1687 / #1687.3 — un espion, pas le module réel : ce fichier vérifie que la
// fiche ÉMET (tab_opened au clic, error_shown à l'échec de lecture), sans
// jamais faire confiance à `VITE_PRODUCT_TRACKER_ENABLED` (absente en test,
// donc le module réel serait un no-op silencieux qui ne prouverait rien).
const trackTabOpened = vi.fn()
const trackErrorShown = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackTabOpened: (...args: unknown[]) => trackTabOpened(...args),
  trackErrorShown: (...args: unknown[]) => trackErrorShown(...args),
}))

vi.mock('../../talent-api', () => ({
  useTalentSkills: () => ({ data: skills, isLoading: false, isError: false }),
  useTalentExperiences: () => ({ data: [] }),
  useTalentDocuments: () => ({ data: documents, isError: false }),
  // #4034.4 — l'aperçu : texte extrait, et pas d'original conservé ici.
  useTalentDocumentFileUrl: () => ({ data: undefined, isLoading: false, isError: false }),
  useTalentDocumentText: () => ({ data: { text: 'TEXTE DU CV EXTRAIT', partial: false }, isError: false }),
  useUpsertTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentSkill: () => ({ mutate: vi.fn() }),
  useValidateTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useAddTalentDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentDocument: () => ({ mutate: vi.fn() }),
  // #2185.51 — « Préparer un message » : un brouillon, jamais un envoi.
  useTalentPreparedMessages: () => ({ data: preparedMessages }),
  usePrepareTalentMessage: () => ({ mutateAsync: prepareMessageMutateAsync, isPending: false }),
  // #4347 — la rédaction de Laura (le lot messages) ; ici le brouillon est un échec muet, la fenêtre se teste ailleurs.
  useDraftTalentMessage: () => ({ mutateAsync: vi.fn().mockRejectedValue(new Error('hors périmètre')) }),
  // ⚠️ `TalentPhotoUpload` est monté par la fiche depuis la fusion du 01/09 :
  // c'est le SEUL chemin d'écriture de la photo, le reste de l'ancienne barre
  // étant parti dans `TalentDetailHeader`, qui ne fait que la lire. Sans cette
  // entrée, le mock jette au premier rendu — et les vingt-six tests du fichier
  // tombent d'un coup, sur une erreur qui ne nomme aucun d'eux.
  useSetTalentPhoto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // #2185.22/.24/.25 — l'onglet Identité (doublons) rejoint désormais l'onglet
  // Profil : `TalentIdentityPanel` (non mocké) monte à chaque ouverture de ce
  // groupe. Un vivier SANS doublon est l'état réel le plus courant.
  useTalentIdentity: () => ({ data: { state: 'new', items: [] }, isLoading: false, isError: false }),
  useTalentIdentityPreview: () => ({ data: undefined, isLoading: false }),
  useDecideTalentIdentity: () => ({ mutate: vi.fn(), isPending: false }),
  useUndoTalentIdentity: () => ({ mutate: vi.fn(), isPending: false }),
}))
// #2327.1 — `CvDropZone` (montée dans l'onglet Documents) lit `useCvIntake`
// depuis CE MÊME module (`../hooks`, résolu depuis `CvDropZone.tsx` comme
// depuis ce fichier) : sans cette entrée, le mock ci-dessous le rendrait
// `undefined` et ferait tomber TOUS les tests de ce fichier qui ouvrent
// l'onglet Documents.
const cvIntakeMutateAsync = vi.fn()
// #2185.48 — « Valider disponibilité » : le geste qui revalide la
// disponibilité déclarée sans en changer la valeur.
const confirmAvailabilityMutate = vi.fn()
let confirmAvailabilityIsSuccess = false
let confirmAvailabilityError: Error | null = null
// #4577 — le droit d'écrire se pilote ici ; le reste de `@/lib/permissions` est le VRAI.
let workspaceAccess: ReturnType<typeof import('@/lib/permissions').useUserPermissions> = {
  status: 'known',
  role: 'sales',
  extraPermissions: [],
  permissions: ['records:write'],
}
vi.mock('@/lib/permissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  useUserPermissions: () => workspaceAccess,
}))
vi.mock('../../hooks', () => ({
  // #2195.12 — la modale d'édition lit le vivier pour proposer un manager. Un
  // vivier VIDE est un état réel (premier jour d'un espace), et c'est celui
  // que ce fichier décrit : le champ se réduit alors à « non renseigné ».
  useConsultants: () => ({ data: [] }),
  useConsultant: () => ({ data: talent, isLoading: false, isError: talentIsError, error: talentError }),
  useTalentSummary: () => ({ data: row, isLoading: rowIsLoading, isError: rowIsError }),
  useUpdateConsultant: () => ({ mutateAsync: updateConsultantMutateAsync, isPending: false }),
  useArchiveTalent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReactivateTalent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTalentMissions: () => ({ data: talentMissions }),
  useCvIntake: () => ({ mutateAsync: cvIntakeMutateAsync, isPending: false }),
  useOpportunitiesForMatch: () => ({ data: opportunities }),
  // #2570 — `TalentProfileTab` (onglet Profil, non mocké : voir la note
  // au-dessus) monte `TalentEnrichAction`, qui lit ce hook au premier rendu.
  useEnrichTalent: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
  }),
  // #3831.1 — `TalentEnrichAction` lit aussi ce hook pour la recherche sans
  // profil professionnel connu.
  useSearchTalentByName: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
  }),
  useConfirmTalentAvailability: () => ({
    mutate: confirmAvailabilityMutate,
    isPending: false,
    isSuccess: confirmAvailabilityIsSuccess,
    isError: confirmAvailabilityError !== null,
    error: confirmAvailabilityError,
  }),
  // #2948 (#2329.47/.51) — `TalentProfileTab` monte aussi ces deux actions.
  useConfirmTjmValidated: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useConfirmCvValidated: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  // #3256 — `TalentProfileTab` monte aussi le relevé d'entretien (traits, montée en charge).
  useRecordInterviewTrait: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRecordRampUp: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  // #3406 — `TalentProfileTab` monte aussi le renseignement terrain.
  useRecordFieldReport: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  // #2185.10 — « Suivi par », désigné depuis l'entête.
  useSetTalentOwner: () => ({ mutateAsync: setOwnerMutateAsync, isPending: false }),
}))
// #2185.42 — le retour COMPLET du client sur un positionnement (onze axes,
// `useSubmissionFeedback`), pas seulement `outcomeReason`. `feedback` est
// réassignable par les tests qui en ont besoin ; les autres le laissent vide.
let feedback: {
  id: string
  technical: string
  experience: string
  communication: string
  price: string
  seniority: string
  context: string
  availability: string
  location: string
  timing: string
  other: string
  personality: string
  verbatim: string | null
  learning: string | null
}[] = []
// #2185.50 — « Ajouter à un besoin » : `openNeeds` reste vide par défaut
// (comportement inchangé des tests existants), réassignable par les tests qui
// en ont besoin.
let openNeeds: { id: string; title: string; project_id: string | null; account_name: string | null }[] = []
const createSubmissionMutate = vi.fn()
vi.mock('@/features/submissions/api', () => ({
  useSubmissions: () => ({ data: { items: submissionItems } }),
  useSubmissionFeedback: () => ({ data: feedback }),
  useCreateSubmission: () => ({
    mutate: createSubmissionMutate,
    mutateAsync: createSubmissionMutateAsync,
    isPending: false,
    isError: false,
  }),
}))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({ data: { data: openNeeds }, isLoading: false }),
}))
// #2185.42 — le retour client structuré a son propre dialogue, testé ailleurs
// (`SubmissionFeedbackDialog.test.tsx`) : ce fichier vérifie seulement que la
// fiche OUVRE la bonne instance, pas ce que le dialogue rend.
vi.mock('@/features/submissions/view/SubmissionFeedbackDialog', () => ({
  SubmissionFeedbackDialog: ({ submissionId }: { submissionId: string }) => (
    <p>panneau du retour client — {submissionId}</p>
  ),
}))
// Théo C talents-fiche.A8 — le brief de soutenance, ouvert depuis un positionnement.
vi.mock('../ConsultantBriefDialog', () => ({
  ConsultantBriefDialog: ({ open, opportunityId }: { open: boolean; opportunityId: string }) =>
    open ? <p>brief de soutenance — {opportunityId}</p> : null,
}))
// Théo C talents-fiche.A9 — le bandeau d'engagement monte sur la fiche (sa requête est testée à part).
vi.mock('../ConsultantEngagementBanner', () => ({
  ConsultantEngagementBanner: ({ consultantId }: { consultantId: string }) => (
    <p>bandeau d’engagement — {consultantId}</p>
  ),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))
// #2185.10 — « Suivi par » lit le vivier de l'espace, comme la promesse
// d'attribution des comptes (`AccountCollaborationBand`). Un vivier VIDE est
// l'état réel d'un espace neuf : le sélecteur se réduit alors à « aucun
// membre ».
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => ({ data: null }) }))

/**
 * Les panneaux LOURDS rendent un marqueur, pas `null`.
 *
 * Les remplacer par `null` ferait mentir le point 3 dans les deux sens : la
 * garde échouerait sur des onglets qui rendent réellement quelque chose, et
 * elle ne mesurerait plus ce qu'elle prétend — que la PAGE branche un contenu
 * sur chaque onglet. Les onglets dont le contenu est écrit dans la page même
 * (Profil, Compétences, Documents, Positionnements, Missions) ne sont, eux, pas
 * mockés : leur texte est celui du produit.
 */
vi.mock('@/features/crm-core/view/NotesPanel', () => ({ NotesPanel: () => <p>panneau des notes</p> }))
vi.mock('@/features/matching/view/InverseMatchPanel', () => ({
  InverseMatchPanel: () => <p>panneau de rapprochement inverse</p>,
}))
// #1790 — le mock EXPOSE `onDone` au lieu de l'avaler : un stub qui l'ignore
// ne pourrait jamais prouver que l'appelant (`TalentDetailPage`) le neutralise.
// Le bouton simule le clic « Valider » RÉEL du panneau, une fois la mutation
// résolue côté serveur — c'est le SEUL signal de fin que le panneau émet.
vi.mock('../parse/CvReviewPanel', () => ({
  CvReviewPanel: ({ onDone }: { onDone: () => void }) => (
    <div>
      <p>panneau de revue du CV</p>
      <button type="button" onClick={onDone}>
        simuler la validation
      </button>
    </div>
  ),
}))
vi.mock('../studio/CvStudioPanel', () => ({ CvStudioPanel: () => <p>panneau du dossier de compétences</p> }))
vi.mock('./TalentConsentTab', () => ({ TalentConsentTab: () => <p>panneau du consentement</p> }))
vi.mock('./TalentRatesTab', () => ({ TalentRatesTab: () => <p>panneau des taux</p> }))
vi.mock('../ConsultantFormDialog', () => ({ ConsultantFormDialog: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { TalentDetailPage } = await import('./TalentDetailPage')

/**
 * #2185.22/.24/.25 — LES SIX ONGLETS de la fiche, dans l'ordre où ils sont
 * rendus (regroupement du 26/09/2026, brief nuit) : les dix onglets d'origine
 * ont été DÉPLACÉS dans ces six familles, aucun contenu retiré. « Dossier »,
 * « Disponibilité & TJM », « Positionnements », « Missions » et « Identité »
 * restent des RÉGIONS nommées à l'intérieur de leur famille (« Documents » et
 * « Missions & disponibilité » / « Profil »), atteignables sans être des
 * boutons de premier niveau.
 */
// Théo C talents-fiche.R1 — cinq onglets : Profil · Présentations · Documents · Activité · Conformité.
const TAB_LABELS = ['Profil', 'Présentations', 'Documents', 'Activité', 'Conformité']

beforeEach(() => {
  talent = EMPTY_TALENT
  row = EMPTY_ROW
  rowIsError = false
  rowIsLoading = false
  talentIsError = false
  talentError = null
  documents = []
  preparedMessages = []
  prepareMessageMutateAsync.mockReset()
  prepareMessageMutateAsync.mockResolvedValue({})
  skills = []
  opportunities = []
  talentMissions = []
  inverseMock.mockReset()
  inverseMock.mockResolvedValue({ needs: [] })
  submissionItems = []
  feedback = []
  openNeeds = []
  confirmAvailabilityIsSuccess = false
  confirmAvailabilityError = null
  trackTabOpened.mockClear()
  trackErrorShown.mockClear()
  cvIntakeMutateAsync.mockReset()
  createSubmissionMutateAsync.mockReset()
  createSubmissionMutateAsync.mockResolvedValue({})
  updateConsultantMutateAsync.mockReset()
  updateConsultantMutateAsync.mockResolvedValue(EMPTY_TALENT)
  setOwnerMutateAsync.mockReset()
  setOwnerMutateAsync.mockResolvedValue(EMPTY_TALENT)
  confirmAvailabilityMutate.mockReset()
  createSubmissionMutate.mockReset()
})
afterEach(cleanup)

/** #4346 — le menu « Autres gestes » de la fiche, où vivent les gestes retirés de l'en-tête. */
async function openMoreMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Autres gestes de la fiche/ }))
}

function tabButton(label: string): HTMLElement {
  return screen.getByRole('button', { name: label })
}

describe('la barre d’onglets de la fiche talent — la cause du chevauchement', () => {
  it('DÉFILE au lieu de comprimer : `overflow-x-auto` sur la barre', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const bar = tabButton('Profil').closest('[class*="overflow-x-auto"]')
    // Sans cette classe, dix onglets se partagent la largeur disponible et
    // aucun débordement ne défile : c'est la barre Radix qui échouait ici.
    expect(bar).not.toBeNull()
  })

  it('ne COMPRIME aucun onglet : `shrink-0` sur le conteneur, jamais `flex-1` sur le bouton', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    for (const label of TAB_LABELS) {
      const button = tabButton(label)
      // `flex-1` est littéralement ce qui produisait le chevauchement :
      // `flex-basis: 0` + `flex-shrink: 1` + `whitespace-nowrap`.
      expect(button.className).not.toContain('flex-1')
      const container = button.parentElement
      expect(container?.className ?? '').toContain('shrink-0')
    }
  })

  it('rend les CINQ libellés en entier — un onglet qu’on ne lit pas n’existe pas', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    for (const label of TAB_LABELS) expect(tabButton(label)).toBeTruthy()
  })

  // Théo C talents-fiche.R1 — Compétences et Missions & disponibilité ne sont plus des boutons : leur contenu vit dans Profil / Présentations.
  it('ne montre PLUS « Compétences » ni « Missions & disponibilité » comme onglets', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.queryByRole('button', { name: 'Expertise & qualification' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Missions & disponibilité' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revue du CV' })).toBeNull()
  })

  // Théo C talents-fiche.R1/A3 — la revue du CV vit dans Documents, pas dans un onglet.
  it('la revue du CV se range dans Documents (A3) : aucun bouton d’onglet, une région dans Documents', async () => {
    const user = userEvent.setup()
    talent = { ...EMPTY_TALENT, review_status: 'needs_review' } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.queryByRole('button', { name: 'Revue du CV' })).toBeNull()
    // Fiche non relue : on arrive sur Documents, là où la revue attend.
    expect(screen.getByRole('region', { name: 'Documents' })).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Documents' })).getByRole('region', { name: 'Revue du CV' }),
    ).toBeTruthy()
    await user.click(tabButton('Profil'))
    expect(screen.queryByRole('region', { name: 'Revue du CV' })).toBeNull()
  })

  it('une fiche qualifiée AU CV lu propose de CORRIGER la lecture, jamais de la valider', async () => {
    const user = userEvent.setup()
    talent = { ...EMPTY_TALENT, review_status: 'qualified', cv_text: 'Yanis — SRE' } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Documents'))
    expect(screen.getByRole('region', { name: 'Corriger la lecture du CV' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Revue du CV' })).toBeNull()
    cleanup()

    // Sait dire NON : sans CV en texte, rien à corriger.
    talent = { ...EMPTY_TALENT, review_status: 'qualified', cv_text: null } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Documents'))
    expect(screen.queryByRole('region', { name: 'Corriger la lecture du CV' })).toBeNull()
  })
})

// Théo C talents-fiche.N1/N2 — les deux objectifs en tête, et la phrase de mise en garde sur une fin prévue.
describe('objectifs et mise en garde de la fiche', () => {
  it('N1 — monte « Comparer les besoins » et « Explorer les comptes » sous l’en-tête', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByRole('button', { name: /Comparer les besoins/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Explorer les comptes/ })).toBeTruthy()
  })

  it('N2 — une mission avec une fin prévue porte la phrase : une fin prévue ne confirme pas la disponibilité', () => {
    talentMissions = [
      {
        missionId: 'm1',
        accountName: 'ACME',
        label: null,
        startsOn: '2026-01-01',
        endsOn: '2999-03-31',
        loadPercent: 100,
      },
    ] as typeof talentMissions
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(
      within(screen.getByRole('region', { name: 'Profil' })).getByText(
        /Une fin prévue ne confirme pas la disponibilité du consultant/,
      ),
    ).toBeTruthy()
  })

  it('N2 sait dire NON — sans fin prévue, aucune phrase (on n’affiche pas ce qu’on n’a pas)', () => {
    talentMissions = []
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.queryByText(/Une fin prévue ne confirme pas/)).toBeNull()
  })
})

describe('chaque onglet DIT quelque chose — une fiche vide de tout', () => {
  it.each(TAB_LABELS)('l’onglet « %s » monte une région qui porte du texte', async label => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton(label))

    const panel = screen.getByRole('region', { name: label })
    // Une région montée mais vide est exactement le défaut visé : « un onglet
    // qui rend une page blanche est pire qu'un onglet absent ».
    expect((panel.textContent ?? '').trim().length).toBeGreaterThan(10)
  })

  it('les onglets sans donnée disent POURQUOI, et proposent le geste suivant', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)

    await user.click(tabButton('Documents'))
    const documents = screen.getByRole('region', { name: 'Documents' })
    expect(documents.textContent).toContain('Le CV source')
    // #4402.1 — le CV source se colle EN LIGNE dans l'onglet, plus derrière un bouton qui ouvrait la modale.
    expect(within(documents).getByRole('button', { name: /^Modifier CV du consultant/ })).toBeTruthy()

    await user.click(tabButton('Présentations'))
    const submissions = screen.getByRole('region', { name: 'Positionnements' })
    expect(submissions.textContent).toContain('rapprochement inverse')
    expect(within(submissions).getByRole('button', { name: /besoins qui lui vont/ })).toBeTruthy()
  })

  /**
   * #2327.1 / #2327.17 — DÉFAUT recette 17/09 (passage 7) : l'onglet Documents
   * n'avait AUCUNE zone de dépôt de CV, ni sur une fiche vide (seul un bouton
   * « coller le TEXTE » y menait) ni — pire — sur une fiche qui porte déjà un
   * document, où même ce bouton disparaissait. `CvDropZone` existait
   * (`ConsultantFormDialog.tsx`) mais n'était monté qu'en CRÉATION.
   */
  it('#2327.1 — l’onglet Documents porte une zone de dépôt, même sur une fiche VIDE', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Documents'))

    const panel = screen.getByRole('region', { name: 'Documents' })
    expect(within(panel).getByLabelText('Choisir un fichier')).toBeTruthy()
  })

  it('#2327.17 — et AUSSI sur une fiche qui porte DÉJÀ un document : plusieurs versions se déposent', async () => {
    documents = [{ id: 'd1', filename: 'cv-2025.pdf', extractedChars: 1200 }]
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Documents'))

    const panel = screen.getByRole('region', { name: 'Documents' })
    expect(within(panel).getByText('cv-2025.pdf')).toBeTruthy()
    // Le défaut mesuré : cette zone n'existait qu'à ZÉRO document.
    expect(within(panel).getByLabelText('Choisir un fichier')).toBeTruthy()
  })

  it('#2327.1 — le dépôt rejoint DIRECTEMENT cette fiche (attachToTalentId), sans détour par la modale', async () => {
    cvIntakeMutateAsync.mockResolvedValue({ outcome: 'updated', consultantId: TALENT_ID, extractedChars: 50 })
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Documents'))

    const panel = screen.getByRole('region', { name: 'Documents' })
    const input = within(panel).getByLabelText('Choisir un fichier') as HTMLInputElement
    const file = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' })
    await user.upload(input, file)

    await vi.waitFor(() =>
      expect(cvIntakeMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ attachToTalentId: TALENT_ID })),
    )
  })
})

describe('l’entête de la fiche', () => {
  it('porte la disponibilité DÉCLARÉE, qui gagne sur le planning, marquée comme telle (Louis 23/10/2026)', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    // #4576 — le bloc vit dans la ligne de disponibilité du Profil (maquette Théo), son seul endroit.
    const line = screen.getByTestId('talent-availability-line')
    // Aucune affectation ⇒ on ne conclut pas. Et le déclaratif reste montré.
    expect(line.textContent).toContain('Disponible')
    expect(line.textContent).toContain('gagne sur le planning')
    expect(line.textContent).not.toContain('la fiche dit')
  })

  it('une mission court mais la fiche déclare « disponible » : la déclaration gagne, le planning est NOMMÉ dessous', () => {
    row = {
      ...EMPTY_ROW,
      staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2027-03-31', assignments: 1 },
    }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const line = screen.getByTestId('talent-availability-line')
    expect(line.textContent).toContain('Planning : En mission jusqu’au')
    expect(line.textContent).not.toContain('à corriger')
  })

  it('#3829 — ne porte PLUS le bloc « Complétude de la fiche » (Louis 07/10 : « suppprime »)', () => {
    // Le score et ses cinq axes restent sur la LIGNE du vivier (`TalentCompletenessScore`),
    // le filtre et la tuile : un seul calcul, `talentCompleteness`. Seul le doublon de
    // l'entête de fiche est retiré.
    talent = { ...EMPTY_TALENT, review_status: 'qualified' } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).not.toContain('Complétude')
    for (const axis of ['Identité', 'Tarif']) {
      expect(header.textContent).not.toContain(axis)
    }
    expect(header.textContent).not.toMatch(/\/100/)
  })

  it('ne montre QU’UNE fois la personne — un seul avatar, et le geste photo est dessus (#1780)', () => {
    // Le retour client montrait deux avatars de la même personne à cent pixels
    // l'un de l'autre, avec deux initiales différentes : « NN » au-dessus du
    // lien de retour, « ? » dans l'entête. Loi 4 du tome 7 — rien n'apparaît
    // deux fois sous la même forme avec le même contenu.
    render(<TalentDetailPage talentId={TALENT_ID} />)

    expect(screen.getAllByText('NB')).toHaveLength(1)
    // Le bloc photo reste le SEUL chemin d'écriture de la photo : il ne
    // disparaît pas, il rejoint l'identité qu'il modifie.
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Ajouter une photo')
  })

  // #4576.4 — le lien « Comment travailler ici ? » ne flotte plus seul dans l'en-tête de la coque : la fiche nomme son
  // titre elle-même (`titleInScreen`) et dessine ses gestes dans son corps, donc elle POSE l'emplacement du lien
  // (`ScreenGuideSlot`, #4654) dans cette rangée, avec « Autres gestes de la fiche ». Un seul lien (GA-26).
  // La coque (`CustomerPage`) est doublée dans ce fichier : on joue ici son rôle de fournisseur de l'emplacement.
  it('#4576.4 — « Comment travailler ici ? » est rangé avec les gestes de la fiche, une seule fois', () => {
    function Shell({ children }: { children: React.ReactNode }) {
      const [owner, setOwner] = useState<string | null>(null)
      const claim = useCallback((id: string) => setOwner(current => current ?? id), [])
      const release = useCallback((id: string) => setOwner(current => (current === id ? null : current)), [])
      return (
        <ScreenGuideSlotProvider owner={owner} claim={claim} release={release}>
          {children}
        </ScreenGuideSlotProvider>
      )
    }
    render(
      <Shell>
        <TalentDetailPage talentId={TALENT_ID} />
      </Shell>,
    )

    const guide = screen.getAllByRole('button', { name: /Comment travailler ici/ })
    expect(guide).toHaveLength(1)
    const more = screen.getByRole('button', { name: /Autres gestes de la fiche/ })
    expect(guide[0]?.closest('[data-talent-actions-row]')).toBe(more.closest('[data-talent-actions-row]'))
    expect(guide[0]?.closest('[data-talent-actions-row]')).not.toBeNull()
  })

  it('n’invente NI disponibilité NI complétude quand la ligne de vivier n’a pas pu être lue', () => {
    rowIsError = true
    row = undefined
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    // « Cassé » et « non mesurable » ne se ressemblent pas : l'entête le DIT,
    // et il ne rend ni « 0/100 » ni « disponible ».
    expect(header.textContent).toContain('pas pu lire ses affectations')
    expect(header.textContent).not.toContain('0/100')
  })

  it('un TJM absent le DIT — il ne s’écrit jamais « 0 € »', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('TJM non renseigné')
    expect(header.textContent).not.toContain('0 €')
    cleanup()

    // Sait dire NON : avec un montant, il s'affiche.
    talent = { ...EMPTY_TALENT, tjm: 650 } as Consultant
    row = { ...EMPTY_ROW, tjm: 650 }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByRole('region', { name: 'Nadia Berrada' }).textContent).toContain('650 € / jour')
  })

  it('sans `finance:read`, le PLANCHER et le COÛT ne fuient nulle part dans l’entête', async () => {
    // Ce qui est derrière ce droit dans ce domaine, c'est le plancher et le
    // coût — le TJM cible, lui, est rendu à tout le monde par le serveur. Ils
    // sont RETIRÉS de la réponse, jamais mis à zéro, et l'onglet
    // « Disponibilité & TJM » en est le seul endroit : les répéter ici ferait
    // deux lectures d'un même montant.
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByRole('region', { name: 'Nadia Berrada' }).textContent).not.toMatch(/€/)

    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    expect(profile.textContent).toContain('accès aux données financières')
  })

  it('#4346 — « Écrire à » vit dans le bloc des coordonnées (Profil), plus dans l’en-tête', async () => {
    talent = { ...EMPTY_TALENT, email: 'nadia@example.com' } as Consultant
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(within(header).queryByRole('link', { name: /Écrire à/ })).toBeNull()

    await user.click(tabButton('Profil'))
    const contact = within(screen.getByRole('region', { name: 'Profil' })).getByRole('link', {
      name: /Écrire à Nadia Berrada/,
    })
    expect(contact.getAttribute('href')).toBe('mailto:nadia@example.com')
  })

  it('#4034 — une fiche qui porte un CV l’ouvre depuis le menu « Autres gestes », au bon onglet', async () => {
    const user = userEvent.setup()
    row = { ...EMPTY_ROW, hasCv: true }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    // #4346 — plus dans l'en-tête, mais atteignable.
    expect(within(header).queryByRole('button', { name: /Ouvrir le CV/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Documents' })).toBeNull()

    await openMoreMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /Ouvrir le CV/ }))
    expect(screen.getByRole('region', { name: 'Documents' })).toBeTruthy()
  })

  it('#4034.4 — « Ouvrir le CV » ouvre l’APERÇU du CV le plus récent', async () => {
    documents = [{ id: 'd1', filename: 'cv-2025.pdf', extractedChars: 1200, kind: 'cv' }]
    const user = userEvent.setup()
    row = { ...EMPTY_ROW, hasCv: true }
    render(<TalentDetailPage talentId={TALENT_ID} />)

    await openMoreMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /Ouvrir le CV/ }))
    const preview = screen.getByRole('dialog', { name: 'Aperçu du CV' })
    expect(preview.textContent).toContain('TEXTE DU CV EXTRAIT')
    // `hasOriginal` absent = original non conservé : la phrase le DIT.
    expect(preview.textContent).toContain('Original non conservé pour ce CV')
  })

  it('#4034.4 — cliquer sur un document de la liste ouvre son aperçu', async () => {
    documents = [{ id: 'd1', filename: 'cv-2025.pdf', extractedChars: 1200, kind: 'cv' }]
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Documents'))

    expect(screen.queryByRole('dialog', { name: 'Aperçu du CV' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Aperçu de cv-2025.pdf' }))
    expect(screen.getByRole('dialog', { name: 'Aperçu du CV' })).toBeTruthy()
  })

  it('#4034 — sans CV, le geste n’existe pas (on n’affiche pas ce qu’on n’a pas) et pendant le chargement non plus', async () => {
    const user = userEvent.setup()
    row = { ...EMPTY_ROW, hasCv: false }
    const { unmount } = render(<TalentDetailPage talentId={TALENT_ID} />)
    await openMoreMenu(user)
    expect(screen.queryByRole('menuitem', { name: /Ouvrir le CV/ })).toBeNull()
    unmount()
    row = undefined
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await openMoreMenu(user)
    expect(screen.queryByRole('menuitem', { name: /Ouvrir le CV/ })).toBeNull()
  })

  it('#4346 — sans coordonnée, le bloc des coordonnées PROPOSE « Ajouter » (cible ≥ 44 px), l’en-tête non', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(within(header).queryByRole('button', { name: /Ajouter un moyen de contact/ })).toBeNull()

    await user.click(tabButton('Profil'))
    const add = within(screen.getByRole('region', { name: 'Profil' })).getByRole('button', {
      name: /Ajouter un moyen de contact/,
    })
    expect(add.className).toMatch(/min-h-11|h-11/)
  })

  it('coordonnées hors périmètre : le bloc des coordonnées le DIT, il n’offre ni écrire ni ajouter', async () => {
    talent = { ...EMPTY_TALENT, contact_visible: false, email: undefined } as Consultant
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    expect(profile.textContent).toContain('Masqué')
    expect(within(profile).queryByRole('button', { name: /Ajouter un moyen de contact/ })).toBeNull()
    expect(within(profile).queryByRole('link', { name: /Écrire à/ })).toBeNull()
  })

  it('#4346 — « Chercher les besoins » n’est plus un bouton : « Ajouter à un besoin » l’absorbe', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.queryByRole('button', { name: /Chercher les besoins/ })).toBeNull()
  })

  // #2185.9 — le type de contrat rejoint la ligne d'identité, comme la
  // séniorité et le mode d'engagement : la même forme, jamais une seconde.
  it('#2185.9 — porte le type de contrat, à côté de la séniorité et du mode d’engagement', () => {
    talent = { ...EMPTY_TALENT, contract_type: 'freelance' } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Freelance')
  })

  // #2185.6 / #2185.7 — la zone et la mobilité structurée : une ABSENCE ne
  // fait AUCUNE ligne (doctrine « on n'affiche pas ce qu'on n'a pas »),
  // jamais un badge vide.
  it('#2185.6/.7 — porte la zone et la mobilité structurée quand elles sont connues', () => {
    talent = {
      ...EMPTY_TALENT,
      zones: ['IDF', 'Lyon'],
      mobility: { zones: null, remote: 'hybride', travel: 'ponctuel', relocation: null },
    } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('IDF')
    expect(header.textContent).toContain('Lyon')
    expect(header.textContent).toContain('Hybride')
    expect(header.textContent).toContain('Déplacements ponctuels')
  })

  // #3935 — recette prod 12/10 : l'en-tête disait « Île-de-France », l'Identité « Non renseigné ».
  it('#3935 — l’en-tête et la Localisation du Profil disent la même chose, « Non renseigné » seulement s’il n’y a rien', async () => {
    const user = userEvent.setup()
    const locationRow = () =>
      within(screen.getByRole('region', { name: 'Profil' }))
        .queryByText('Localisation')
        ?.closest('div') ?? null

    talent = { ...EMPTY_TALENT, location: null, zones: ['Île-de-France'] } as Consultant
    const { unmount } = render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByRole('region', { name: 'Nadia Berrada' }).textContent).toContain('Île-de-France')
    await user.click(tabButton('Profil'))
    expect(locationRow()?.textContent).toContain('Île-de-France')
    expect(locationRow()?.textContent).not.toContain('Non renseigné')
    unmount()

    talent = { ...EMPTY_TALENT, location: null, zones: [] } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    // SIMON-FIX S.4 — rien à dire : la ligne n'existe pas.
    expect(locationRow()).toBeNull()
  })

  it('#2185.6/.7 — zone et mobilité non renseignées : aucune ligne inventée', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).not.toContain('Hybride')
    expect(header.textContent).not.toContain('Déplacements')
  })

  // #2185.11 — la fraîcheur de la fiche : toujours datée, jamais implicite.
  it('#2185.11 — date la dernière mise à jour de la fiche', () => {
    talent = { ...EMPTY_TALENT, updated_at: '2026-09-20T00:00:00.000Z' } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Mis à jour le')
  })

  // #2185.13 — la prospection inversée (Reverse Market) n'était atteignable
  // que depuis la LIGNE du vivier (`VivierTableRow.tsx`) : rien, depuis la
  // fiche elle-même, ne menait à « où placer cette personne ? ».
  it('#2185.13 / #4346 — la prospection inversée (Reverse Market) reste atteignable : menu « Autres gestes »', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(within(header).queryByRole('link', { name: /Où placer/ })).toBeNull()
    await openMoreMenu(user)
    expect(screen.getByRole('menuitem', { name: /Où placer Nadia Berrada/ })).toBeTruthy()
  })

  // #2185.48 / #2877 (recette prod 02/10) — « Valider la disponibilité » existait
  // DEUX fois sur la fiche (en-tête ET onglet Profil, deux chemins d'écriture
  // différents). Il n'en reste qu'un, à côté de la valeur qu'il revalide : l'onglet
  // Profil. L'en-tête ne le répète pas.
  it('#2877 — « Valider la disponibilité » n’est PAS répété dans l’en-tête de la fiche', async () => {
    talent = { ...EMPTY_TALENT, availability: 'immediate' } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(within(header).queryByRole('button', { name: 'Valider la disponibilité' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Valider la disponibilité' }).length).toBeLessThanOrEqual(1)
  })

  // #2185.4 / #2185.12 — LE STATUT et L'ACTION PRINCIPALE qui en dépend :
  // cinq états, une seule action à la fois, jamais un second geste par défaut
  // pendant que le statut est encore en train de se calculer.
  it('#2185.4 — aucune affectation connue : « Disponibilité à vérifier », jamais « Disponible »', () => {
    // Fiche par ailleurs enrichie (trois axes hors disponibilité) : sinon le
    // gate « Fiche incomplète » l'emporterait avant même de regarder
    // l'affectation, et le test ne mesurerait plus ce qu'il prétend.
    row = { ...EMPTY_ROW, skillCount: 3, tjm: 500, hasCv: true }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Disponibilité à vérifier')
  })

  it('#2185.4/#2185.18 — une fiche qui attend sa relecture est « Fiche incomplète » ; « Modifier » n’est plus dans « Autres gestes » (#4402.1)', async () => {
    talent = { ...EMPTY_TALENT, review_status: 'needs_review' } as Consultant
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Fiche incomplète')
    expect(within(header).queryByRole('button', { name: 'Compléter les informations' })).toBeNull()
    await openMoreMenu(user)
    // #4402.1 — chaque champ se modifie sur la fiche ; la modale et son entrée de menu sont retirées (GA-26).
    expect(screen.queryByRole('menuitem', { name: /Modifier/ })).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Archiver/ })).toBeTruthy()
  })

  it('#2185.4/#2185.17 — « En mission » : « Voir la mission » OUVRE l’onglet Missions (mission en cours)', async () => {
    const user = userEvent.setup()
    row = {
      ...EMPTY_ROW,
      skillCount: 3,
      tjm: 500,
      hasCv: true,
      staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2027-03-31', assignments: 1 },
    }
    talentMissions = [
      {
        missionId: 'm1',
        accountName: 'ACME',
        label: null,
        startsOn: '2026-01-01',
        endsOn: '2027-03-31',
        loadPercent: 100,
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('En mission')

    await user.click(within(header).getByRole('button', { name: 'Voir la mission' }))
    expect(screen.getByRole('region', { name: 'Missions et engagements' })).toBeTruthy()
  })

  it('#2185.4/#2185.16 — un positionnement ouvert est « Positionné » ; les positionnements restent dans leur onglet', async () => {
    const user = userEvent.setup()
    row = {
      ...EMPTY_ROW,
      skillCount: 3,
      tjm: 500,
      hasCv: true,
      staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
      submissions: { open: 1, total: 2 },
    }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Positionné')
    expect(within(header).queryByRole('button', { name: 'Suivre les retours' })).toBeNull()

    await user.click(tabButton('Présentations'))
    expect(screen.getByRole('region', { name: 'Positionnements' })).toBeTruthy()
  })

  it('#2185.4/#4346 — « Disponibilité à vérifier » : le statut reste, le bouton « Recontacter » est parti (Écrire à vit dans Profil)', () => {
    talent = { ...EMPTY_TALENT, email: 'nadia@example.com' } as Consultant
    row = { ...EMPTY_ROW, skillCount: 3, tjm: 500, hasCv: true }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Disponibilité à vérifier')
    expect(within(header).queryByRole('link', { name: /Recontacter/ })).toBeNull()
  })

  it('#2185.4/#4346 — disponibilité confirmée, rien en cours : « Disponible », sans bouton « Trouver des comptes » (Où placer vit dans Autres gestes)', () => {
    row = {
      ...EMPTY_ROW,
      skillCount: 3,
      tjm: 500,
      hasCv: true,
      staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
    }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Disponible')
    expect(within(header).queryByRole('link', { name: 'Trouver des comptes' })).toBeNull()
  })

  it('#2185.4 — aucun statut ni action pendant le chargement de la ligne de vivier — un statut de chargement mentirait', () => {
    row = undefined
    rowIsLoading = true
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    for (const label of ['Disponible', 'Positionné', 'En mission', 'Disponibilité à vérifier', 'Fiche incomplète']) {
      expect(header.textContent).not.toContain(label)
    }
  })
})

// #2185.50 — « Ajouter à un besoin », atteignable depuis la fiche : le MÊME
// geste que `ConsultantMatchPanel` sur la ligne du vivier, jamais un second
// chemin d'écriture de positionnement.
describe('« Ajouter à un besoin », depuis la fiche', () => {
  it('ouvre une fenêtre qui liste le portefeuille et pousse le profil choisi, en « retenu »', async () => {
    const user = userEvent.setup()
    opportunities = [{ id: 'p-1', company_name: 'ACME', label: 'Architecte plateforme' }]
    render(<TalentDetailPage talentId={TALENT_ID} />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à un besoin' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('option', { name: /ACME — Architecte plateforme/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))

    expect(createSubmissionMutateAsync).toHaveBeenCalledWith({
      projectId: 'p-1',
      consultantId: TALENT_ID,
      stage: 'shortlisted',
      proposedRateCents: null,
    })
  })

  it('un portefeuille sans besoin ouvert le DIT, plutôt qu’un menu vide', async () => {
    const user = userEvent.setup()
    opportunities = []
    render(<TalentDetailPage talentId={TALENT_ID} />)

    await user.click(screen.getByRole('button', { name: 'Ajouter à un besoin' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Aucun besoin ouvert')
    expect(within(dialog).queryByRole('listbox')).toBeNull()
  })
})

// #2185.51 — « Préparer un message », depuis la fiche : un brouillon, jamais
// un envoi — distinct du moteur outreach existant (contact_id NOT NULL).
describe('« Préparer un message », depuis la fiche', () => {
  it('enregistre le brouillon SANS l’envoyer', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)

    await user.click(screen.getByRole('button', { name: 'Préparer un message' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Message'), 'Bonjour, je reviens vers vous.')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le brouillon' }))

    expect(prepareMessageMutateAsync).toHaveBeenCalledWith({
      channel: 'email',
      subject: null,
      body: 'Bonjour, je reviens vers vous.',
    })
  })

  it('montre les brouillons déjà préparés, jamais un envoi confondu avec « fait »', async () => {
    const user = userEvent.setup()
    preparedMessages = [
      {
        id: 'm-1',
        talentId: TALENT_ID,
        channel: 'phone',
        subject: null,
        body: 'À rappeler la semaine prochaine.',
        preparedByName: 'Louis Schlegel',
        createdAt: '2026-09-26T09:00:00.000Z',
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)

    await user.click(screen.getByRole('button', { name: 'Préparer un message' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('À rappeler la semaine prochaine.')
    expect(dialog.textContent).toContain('Louis Schlegel')
  })
})

// #2185.42 — LE RETOUR CLIENT structuré (plusieurs axes, `SubmissionFeedbackDialog`)
// atteint désormais l'onglet Positionnements de la fiche — jusqu'ici, seul le
// court `outcomeReason` y était lisible.
describe('l’onglet Positionnements — le retour client structuré', () => {
  it('#2185.42 — un positionnement PRÉSENTÉ (au-delà de « retenu ») propose de noter le retour', async () => {
    const user = userEvent.setup()
    submissionItems = [
      { id: 'sub-1', accountName: 'ACME', projectLabel: null, stage: 'submitted', outcomeReason: null },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })

    await user.click(within(tab).getByRole('button', { name: 'Noter le retour client' }))
    expect(screen.getByText('panneau du retour client — sub-1')).toBeTruthy()
  })

  it('#2185.42 — un positionnement encore « retenu » ne propose PAS de retour : rien n’a encore été présenté', async () => {
    const user = userEvent.setup()
    submissionItems = [
      { id: 'sub-1', accountName: 'ACME', projectLabel: null, stage: 'shortlisted', outcomeReason: null },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })

    expect(within(tab).queryByRole('button', { name: 'Noter le retour client' })).toBeNull()
  })
})

// Théo C talents-fiche.A8 — « Brief et soutenance » sur chaque positionnement de l'onglet Présentations.
describe('Présentations — brief et soutenance (A8)', () => {
  it('ouvre le brief de CE positionnement', async () => {
    const user = userEvent.setup()
    submissionItems = [
      {
        id: 'sub-1',
        accountName: 'ACME',
        projectLabel: null,
        stage: 'presented',
        outcomeReason: null,
        projectId: 'p-42',
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })
    expect(screen.queryByText(/brief de soutenance — p-42/)).toBeNull()
    await user.click(within(tab).getByRole('button', { name: 'Brief et soutenance' }))
    expect(screen.getByText('brief de soutenance — p-42')).toBeTruthy()
  })

  it('sait dire NON — sans positionnement, aucun bouton de brief', async () => {
    const user = userEvent.setup()
    submissionItems = []
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    expect(screen.queryByRole('button', { name: 'Brief et soutenance' })).toBeNull()
  })
})

// Théo C talents-fiche.A9/A10 — complétude de la fiche et bandeau d'engagement, gardés dans le Profil.
describe('Profil — complétude et engagement (A9/A10)', () => {
  it('A10 — la complétude de la fiche est lisible dans le Profil, axes au survol', () => {
    row = { ...EMPTY_ROW, skillCount: 3, tjm: 500, hasCv: true }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const profile = screen.getByRole('region', { name: 'Profil' })
    // Théo 23/10 : en clair, jamais en points — ce qui manque est nommé.
    expect(profile.textContent).toContain('À compléter : disponibilité')
    expect(profile.textContent).not.toMatch(/\/\s?100/)
  })

  it('A10 sait dire NON — la ligne de vivier pas encore lue : aucun score inventé', () => {
    row = undefined
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByRole('region', { name: 'Profil' }).textContent).not.toContain('À compléter')
  })

  it('A9 — le bandeau d’engagement du consultant est monté sur la fiche', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByText(`bandeau d’engagement — ${TALENT_ID}`)).toBeTruthy()
  })
})

describe('l’onglet Profil — quatre groupes, et non dix champs à plat', () => {
  it('groupe ce qui va ensemble', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    for (const group of [
      'Identité et contact',
      'Engagement et tarif',
      'Couverture et langues',
      'Habilitations et envie',
      'Expériences et formations',
    ]) {
      expect(within(profile).getByRole('heading', { name: group })).toBeTruthy()
    }
  })

  // #4405.2 (GA-26) — Intitulé, E-mail et Téléphone vivent dans le formulaire inline (« Identité et
  // engagement », « Coordonnées ») : la lecture seule ne les redit pas.
  it('#4405.2 — intitulé, e-mail et téléphone n’apparaissent qu’UNE fois', async () => {
    const user = userEvent.setup()
    talent = {
      ...EMPTY_TALENT,
      title: 'Architecte cloud',
      email: 'nadia@example.com',
      phone: '0102030405',
    } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    expect(within(profile).getAllByText('Intitulé de poste')).toHaveLength(1)
    expect(within(profile).getAllByText('Email')).toHaveLength(1)
    expect(within(profile).getAllByText('Téléphone')).toHaveLength(1)
  })

  // #2185.27/.28 — pas de structure d'expériences/formations : jamais un contenu inventé.
  // KEVIN-FIX K.2 (20/10) — et une rubrique absente ne s'affiche plus en mur « Non renseigné » :
  // dans une liste, une absence ne fait aucune ligne.
  it('#2185.27/.28 — expériences et formations absentes : aucune ligne, jamais une structure inventée', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    const group = within(profile).getByRole('heading', { name: 'Expériences et formations' }).closest('div')
    expect(group).not.toBeNull()
    // SIMON-FIX S.4 — rien de connu : aucune ligne « Non renseigné » dans le groupe.
    expect(within(group as HTMLElement).queryAllByText('Non renseigné')).toHaveLength(0)
    expect(within(group as HTMLElement).queryByText('Expériences')).not.toBeInTheDocument()
    expect(within(group as HTMLElement).queryByText('Formations')).not.toBeInTheDocument()
  })

  it('une rubrique absente ne s’affiche pas — ni tiret muet, ni zéro, ni mur de « Non renseigné » (SIMON-FIX S.4)', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    expect(within(profile).queryAllByText('Non renseigné')).toHaveLength(0)
  })

  // #2185.30 / #2185.31 — les préférences de mission et les contraintes de
  // mobilité EXISTENT sur la personne (`Consultant.preferences`,
  // `.mobility.relocation`) mais n'atteignaient aucun onglet.
  it('#2185.30/.31 — porte les préférences de mission et la mobilité géographique, quand elles sont connues', async () => {
    const user = userEvent.setup()
    talent = {
      ...EMPTY_TALENT,
      preferences: {
        wantedSectors: ['fintech'],
        refusedSectors: ['défense'],
        refusedTechnologies: ['cobol'],
        wantedContractKinds: ['regie'],
      },
      mobility: { zones: null, remote: null, travel: null, relocation: false },
    } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    expect(within(profile).getByRole('heading', { name: 'Préférences et contraintes' })).toBeTruthy()
    expect(profile.textContent).toContain('fintech')
    expect(profile.textContent).toContain('défense')
    expect(profile.textContent).toContain('cobol')
    expect(profile.textContent).toContain('regie')
    // `false` est une vraie réponse (« a dit non ») — jamais confondue avec
    // `null` (« on n'a pas demandé »), ni affichée comme absente.
    expect(profile.textContent).toContain('Non')
  })

  it('#2185.30/.31 — préférences et mobilité non demandées : « non renseigné », jamais une ligne vide', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    expect(within(profile).getByRole('heading', { name: 'Préférences et contraintes' })).toBeTruthy()
  })
})

// #2185.35 — les ANNÉES ne s'affichent QUE si la source les PROUVE (mission
// ou entretien) : un chiffre sur une simple déclaration se lirait comme un
// fait vérifié, exactement ce que le moteur de matching refuse déjà de faire.
describe('l’onglet Compétences — les années, seulement si prouvées', () => {
  it('#2185.35 — une compétence déclarée (jamais prouvée) ne montre AUCUNE année', async () => {
    const user = userEvent.setup()
    skills = [
      {
        id: 's-1',
        skill: 'kubernetes',
        rawLabel: 'Kubernetes',
        level: 'expert',
        years: 6,
        lastUsedYear: null,
        source: 'declared',
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const tab = screen.getByRole('region', { name: 'Expertise & qualification' })
    expect(tab.textContent).not.toContain('ans de pratique')
  })

  it('#2185.35 — une compétence prouvée EN MISSION montre ses années', async () => {
    const user = userEvent.setup()
    skills = [
      {
        id: 's-1',
        skill: 'kubernetes',
        rawLabel: 'Kubernetes',
        level: 'expert',
        years: 6,
        lastUsedYear: null,
        source: 'mission',
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const tab = screen.getByRole('region', { name: 'Expertise & qualification' })
    expect(tab.textContent).toContain('6 ans de pratique')
  })

  it('#2185.35 — une compétence prouvée en ENTRETIEN montre aussi ses années', async () => {
    const user = userEvent.setup()
    skills = [
      {
        id: 's-1',
        skill: 'kubernetes',
        rawLabel: 'Kubernetes',
        level: 'expert',
        years: 3,
        lastUsedYear: null,
        source: 'interview',
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const tab = screen.getByRole('region', { name: 'Expertise & qualification' })
    expect(tab.textContent).toContain('3 ans de pratique')
  })
})

// #2185.36 — `ConsultantSkill.lastUsedYear` existe (`talent.ts`) — une
// compétence de 2014 n'est pas une compétence d'aujourd'hui, et le client le
// demandera. `years` (2185.35) n'est rendu QUE prouvé ; `lastUsedYear` ne
// l'était pas.
describe('l’onglet Compétences — la dernière utilisation, à côté des années', () => {
  it('#2185.36 — porte la dernière année de pratique, quand elle est connue', async () => {
    const user = userEvent.setup()
    skills = [
      {
        id: 's-1',
        skill: 'kubernetes',
        rawLabel: 'Kubernetes',
        level: 'expert',
        years: 6,
        lastUsedYear: 2019,
        source: 'declared',
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const tab = screen.getByRole('region', { name: 'Expertise & qualification' })
    expect(tab.textContent).toContain('2019')
  })

  it('#2185.36 — aucune dernière utilisation inventée quand elle n’est pas connue', async () => {
    const user = userEvent.setup()
    skills = [
      {
        id: 's-1',
        skill: 'kubernetes',
        rawLabel: 'Kubernetes',
        level: 'expert',
        years: 6,
        lastUsedYear: null,
        source: 'declared',
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const tab = screen.getByRole('region', { name: 'Expertise & qualification' })
    expect(tab.textContent).not.toContain('2019')
  })
})

// #2185.38 — `TALENT_DOCUMENT_KINDS` porte `'certificate'` (`talent.ts`) :
// une certification déposée existait dans le schéma sans jamais se
// distinguer, à l'écran, d'un CV ou d'un dossier quelconque.
describe('l’onglet Documents — distingue une certification du reste', () => {
  it('#2185.38 — nomme le type d’un document déposé, certification comprise', async () => {
    const user = userEvent.setup()
    documents = [{ id: 'd-1', filename: 'aws-certified.pdf', extractedChars: 10, kind: 'certificate' }]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Documents'))
    const tab = screen.getByRole('region', { name: 'Documents' })
    expect(tab.textContent).toContain('Certification')
  })
})

// #2185.42 — l'onglet Positionnements ne montrait que l'étape et une raison
// COURTE (`outcomeReason`) : le retour du client existait déjà, complet,
// dans `submission_feedback` (onze axes, `useSubmissionFeedback`), sans
// aucun appelant sur cette fiche.
describe('l’onglet Positionnements — le retour du client, pas seulement une raison courte', () => {
  it('#2185.42 — porte les axes RENSEIGNÉS du dernier retour, jamais ceux non abordés', async () => {
    const user = userEvent.setup()
    submissionItems = [
      { id: 'sub-1', accountName: 'Acme', projectLabel: null, stage: 'submitted', outcomeReason: null },
    ]
    feedback = [
      {
        id: 'f-1',
        technical: 'above',
        experience: 'meets',
        communication: 'unknown',
        price: 'unknown',
        seniority: 'unknown',
        context: 'unknown',
        availability: 'unknown',
        location: 'unknown',
        timing: 'unknown',
        other: 'unknown',
        personality: 'unknown',
        verbatim: 'Bon profil, séniorité un peu courte.',
        learning: null,
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })
    expect(tab.textContent).toContain('Compétences techniques')
    expect(tab.textContent).toContain('Au-dessus')
    expect(tab.textContent).toContain('Expérience')
    expect(tab.textContent).toContain('Correspond')
    expect(tab.textContent).toContain('Bon profil, séniorité un peu courte.')
    // Un axe jamais abordé n'a AUCUNE ligne — ce n'est pas la même chose
    // qu'un axe noté « en dessous ».
    expect(tab.textContent).not.toContain('Tarif')
    expect(tab.textContent).not.toContain('Personnalité')
  })

  it('#2185.42 — aucun retour enregistré : pas de section retour, jamais un bloc vide', async () => {
    const user = userEvent.setup()
    submissionItems = [
      { id: 'sub-1', accountName: 'Acme', projectLabel: null, stage: 'submitted', outcomeReason: null },
    ]
    feedback = []
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })
    expect(tab.textContent).not.toContain('Compétences techniques')
  })
})

// #2185.44 — le Reverse Market restait une page séparée, liée depuis l'entête
// (#2152.46) mais jamais depuis l'onglet Opportunités lui-même.
describe('l’onglet Positionnements — mène au Reverse Market, sans dupliquer la page', () => {
  it('#2185.44 — porte un lien vers le Reverse Market de ce profil', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })
    expect(within(tab).getByRole('link', { name: 'Voir les missions possibles' })).toBeTruthy()
  })
})

// #2185.48 — revalider une disponibilité qui reste JUSTE n'avait aucun
// chemin : l'édition générale ne revalide la fraîcheur QUE quand la valeur
// change.
describe('l’onglet Profil — « Valider disponibilité », sans changer la valeur déclarée', () => {
  it('#2185.48 — le clic appelle la revalidation avec l’identifiant de la fiche', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    await user.click(within(profile).getByRole('button', { name: 'Valider la disponibilité' }))
    expect(confirmAvailabilityMutate).toHaveBeenCalledWith(TALENT_ID)
  })

  it('#2208.69 — un refus du serveur se DIT dans l’onglet, jamais un clic muet', async () => {
    confirmAvailabilityError = new Error('Droit d’écriture requis')
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    expect(within(profile).getByRole('alert').textContent).toContain('Droit d’écriture requis')
    expect(profile.textContent).not.toContain('validée à l’instant')
  })

  it('#2185.48 — confirme, une fois la revalidation faite', async () => {
    confirmAvailabilityIsSuccess = true
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    const profile = screen.getByRole('region', { name: 'Profil' })
    expect(profile.textContent).toContain('validée à l’instant')
  })
})

// #2185.50 — positionner CE talent sur un besoin ouvert, sans quitter sa
// propre fiche : `useCreateSubmission` existait déjà, aucun appelant depuis
// la fiche talent ne le déclenchait.
describe('l’onglet Positionnements — « Ajouter à un besoin »', () => {
  it('#2185.50 — choisir un besoin puis Ajouter crée le positionnement', async () => {
    openNeeds = [{ id: 'need-1', title: 'Ingénieur sécurité', project_id: 'proj-1', account_name: 'Acme' }]
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })

    await chooseOption(
      within(tab).getByRole('combobox', { name: 'Choisir un besoin ouvert' }),
      'Ingénieur sécurité — Acme',
    )
    await user.click(within(tab).getByRole('button', { name: 'Ajouter' }))

    expect(createSubmissionMutate).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1', consultantId: TALENT_ID, needId: 'need-1' }),
      expect.anything(),
    )
  })

  it('#2185.50 — un besoin SANS affaire est écarté du sélecteur — createSubmission exige projectId', async () => {
    openNeeds = [{ id: 'need-1', title: 'Sans affaire', project_id: null, account_name: null }]
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })
    expect(within(tab).queryByRole('combobox', { name: 'Choisir un besoin ouvert' })).toBeNull()
  })

  it('#2185.50 — aucun besoin ouvert : pas de sélecteur, jamais un menu vide', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Présentations'))
    const tab = screen.getByRole('region', { name: 'Positionnements' })
    expect(within(tab).queryByRole('combobox', { name: 'Choisir un besoin ouvert' })).toBeNull()
  })
})

/**
 * #1790 — « j'ai validé le profil mais il ne me met pas sur la page profil,
 * il m'a laissé sur la revue en me laissant l'onglet ouvert ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CAUSE — l'APPELANT neutralisait le composant
 * ─────────────────────────────────────────────────────────────────────────────
 * `CvReviewPanel` appelle bien `onDone()` après que `commit.mutateAsync` a
 * réussi (`CvReviewPanel.tsx`) — le geste existe. Mais `TalentDetailPage`
 * l'appelait avec `onDone={() => undefined}` : un no-op qui absorbait le seul
 * signal de fin que le panneau émet. Tous les tests DU PANNEAU passaient,
 * parce qu'aucun ne regarde ce que fait son appelant de `onDone`.
 */
describe('#1790 — valider le CV mène au profil, pas à un onglet de revue resté ouvert', () => {
  it('sur une fiche « à relire », affiche la revue et PAS le profil', async () => {
    talent = { ...EMPTY_TALENT, review_status: 'needs_review' } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)

    expect(await screen.findByText('panneau de revue du CV')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Profil' })).toBeNull()
  })

  it('une fois la revue validée, ferme le panneau de revue et rend l’écran de profil', async () => {
    const user = userEvent.setup()
    talent = { ...EMPTY_TALENT, review_status: 'needs_review' } as Consultant
    render(<TalentDetailPage talentId={TALENT_ID} />)

    const validate = await screen.findByRole('button', { name: 'simuler la validation' })
    await user.click(validate)

    // La revue s'est refermée : son panneau n'est plus monté.
    expect(screen.queryByText('panneau de revue du CV')).toBeNull()
    // Et c'est le profil qui a pris sa place — pas un onglet resté vide.
    const profile = await screen.findByRole('region', { name: 'Profil' })
    expect((profile.textContent ?? '').trim().length).toBeGreaterThan(10)
  })
})

/**
 * #1687 / #1687.3 — LA FICHE ÉMET : un onglet cliqué, un échec de lecture.
 *
 * `TALENT_ID` est un UUID RÉEL : ce test PROUVE que `screen` porte le MOTIF
 * `/consultants/$id`, jamais l'identifiant (`TabPartners.tsx` a appris cette
 * leçon avec GA-276 côté dossier de compte).
 */
describe('#1687 — trackTabOpened : la fiche talent émet {screen, tab}, jamais un identifiant', () => {
  it('cliquer un onglet émet trackTabOpened("/consultants/$id", <clé de l’onglet>)', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Profil'))
    expect(trackTabOpened).toHaveBeenCalledTimes(1)
    expect(trackTabOpened).toHaveBeenCalledWith('/consultants/$id', 'profile')
    // Jamais l'UUID de la fiche courante.
    expect(trackTabOpened).not.toHaveBeenCalledWith(expect.stringContaining(TALENT_ID), expect.anything())
  })

  it('chaque clic ré-émet — un onglet par émission, jamais accumulé', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(tabButton('Documents'))
    await user.click(tabButton('Activité'))
    expect(trackTabOpened).toHaveBeenNthCalledWith(1, '/consultants/$id', 'documents')
    expect(trackTabOpened).toHaveBeenNthCalledWith(2, '/consultants/$id', 'notes')
  })
})

describe('#4401.1 — une fiche qui ne charge pas dit POURQUOI, et une partie illisible est nommée', () => {
  it('404 : « n’existe plus ou n’appartient pas à ton espace »', () => {
    talentIsError = true
    talentError = new ApiError('Consultant introuvable', 404)
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByText('Cette fiche n’existe plus ou n’appartient pas à ton espace.')).toBeInTheDocument()
  })

  it('500 : le message générique, jamais « n’existe plus »', () => {
    talentIsError = true
    talentError = new ApiError('boom', 500)
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByText(/la requête n’a pas abouti/)).toBeInTheDocument()
    expect(screen.queryByText(/n’existe plus ou n’appartient pas/)).not.toBeInTheDocument()
  })

  it('CV importé partiel : la fiche s’affiche et la partie illisible est nommée', () => {
    talent = { ...EMPTY_TALENT, unreadable_fields: ['stack', 'languages'] }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.getByTestId('talent-unreadable-fields')).toHaveTextContent('Compétences, Langues')
  })

  it('fiche saine : aucun bandeau', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.queryByTestId('talent-unreadable-fields')).not.toBeInTheDocument()
  })
})

describe('#1687.3 — trackErrorShown : l’état d’erreur d’écran de la fiche talent', () => {
  it('un échec de lecture émet trackErrorShown("/consultants/$id", "load_failed") UNE fois', () => {
    talentIsError = true
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(trackErrorShown).toHaveBeenCalledTimes(1)
    expect(trackErrorShown).toHaveBeenCalledWith('/consultants/$id', 'load_failed')
  })

  it('une lecture réussie n’émet rien', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(trackErrorShown).not.toHaveBeenCalled()
  })
})

// #4346 — Louis 19/10 : l'en-tête de la fiche porte EXACTEMENT trois boutons, dans cet ordre.
describe('#4346 — l’en-tête de la fiche consultant : trois boutons, pas un de plus', () => {
  const actionNames = () =>
    within(screen.getByRole('group', { name: 'Actions de la fiche' }))
      .getAllByRole('button')
      .map(button => button.textContent?.trim())

  it('avec une mission en cours : « Voir la mission », « Ajouter à un besoin », « Préparer un message » — dans cet ordre', () => {
    talentMissions = [
      { missionId: 'm1', accountName: 'ACME', label: null, startsOn: '2026-01-01', endsOn: null, loadPercent: 100 },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(actionNames()).toEqual(['Voir la mission', 'Ajouter à un besoin', 'Préparer un message'])
  })

  it('une mission à venir compte aussi', () => {
    talentMissions = [
      {
        missionId: 'm1',
        accountName: 'ACME',
        label: null,
        startsOn: '2999-01-01',
        endsOn: '2999-12-31',
        loadPercent: 100,
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(actionNames()[0]).toBe('Voir la mission')
  })

  it('sans mission en cours ni à venir : le bouton n’apparaît pas (on n’affiche pas ce qu’on n’a pas)', () => {
    talentMissions = [
      {
        missionId: 'm1',
        accountName: 'ACME',
        label: null,
        startsOn: '2020-01-01',
        endsOn: '2020-12-31',
        loadPercent: 100,
      },
    ]
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(actionNames()).toEqual(['Ajouter à un besoin', 'Préparer un message'])
  })

  it('aucun des anciens boutons : ni « placer », ni « Chercher », ni « Modifier », ni « Archiver »', () => {
    row = { ...EMPTY_ROW, hasCv: true }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const group = screen.getByRole('group', { name: 'Actions de la fiche' })
    expect(group.textContent).not.toMatch(/placer|Chercher|Modifier|Archiver|CV|Écrire|Appeler/)
    expect(within(group).queryAllByRole('link')).toHaveLength(0)
  })

  it('« Ajouter à un besoin » propose D’ABORD les besoins qui matchent le consultant, avec recherche', async () => {
    const user = userEvent.setup()
    opportunities = [
      { id: 'p-1', company_name: 'ACME', label: 'Architecte plateforme' },
      { id: 'p-2', company_name: 'Globex', label: 'Data engineer' },
    ]
    inverseMock.mockResolvedValue({
      needs: [{ need: { needId: 'n-2', projectId: 'p-2', role: 'Data engineer' }, result: { bucket: 'recommended' } }],
    })
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(screen.getByRole('button', { name: 'Ajouter à un besoin' }))
    const dialog = screen.getByRole('dialog')
    expect(inverseMock).toHaveBeenCalledWith(TALENT_ID, 'all')

    const options = await within(dialog).findAllByRole('option')
    expect(options.map(option => option.textContent)).toEqual([
      expect.stringContaining('Globex — Data engineer'),
      expect.stringContaining('ACME — Architecte plateforme'),
    ])
    expect(options[0]?.textContent).toContain('Correspond')

    await user.type(within(dialog).getByRole('searchbox'), 'acme')
    expect(within(dialog).queryByText(/Globex/)).toBeNull()
  })

  it('si le matching échoue, la liste reste utilisable et l’échec est nommé', async () => {
    const user = userEvent.setup()
    opportunities = [{ id: 'p-1', company_name: 'ACME', label: 'Architecte plateforme' }]
    inverseMock.mockRejectedValue(new Error('boom'))
    render(<TalentDetailPage talentId={TALENT_ID} />)
    await user.click(screen.getByRole('button', { name: 'Ajouter à un besoin' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText(/pas pu chercher les besoins qui lui correspondent/)).toBeTruthy()
    expect(within(dialog).getAllByRole('option')).toHaveLength(1)
  })
})

/**
 * Refonte Théo (maquette `c/talents-fiche`, 23/10/2026) — LA STRUCTURE DE L'ONGLET
 * PROFIL. Sait dire NON : un bloc qui change d'ordre, un score qui repasse en
 * points, ou la phrase des critères protégés qui disparaît fait tomber la suite.
 */
describe('fiche talent — la structure de la maquette Théo', () => {
  const follows = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('les cinq onglets de la maquette, dans son ordre', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const nav = screen.getByRole('navigation', { name: /onglets/i })
    const labels = within(nav)
      .getAllByRole('button')
      .map(button => button.textContent?.trim())
    expect(labels).toEqual(['Profil', 'Présentations', 'Documents', 'Activité', 'Conformité'])
  })

  it('Profil : disponibilité → Expertise & qualification → Score consultant → Missions et engagements', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const line = screen.getByTestId('talent-availability-line')
    const expertise = screen.getByRole('region', { name: 'Expertise & qualification' })
    const score = screen.getByRole('region', { name: 'Score consultant' })
    const missions = screen.getByRole('region', { name: 'Missions et engagements' })
    expect(follows(line, expertise)).toBe(true)
    expect(follows(expertise, score)).toBe(true)
    expect(follows(score, missions)).toBe(true)
    expect(within(line).getByRole('button', { name: 'Actualiser' })).toBeInTheDocument()
  })

  it('le score consultant s’écrit EN CLAIR, axe par axe, et dit qu’aucun critère protégé n’y entre', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const score = screen.getByRole('region', { name: 'Score consultant' })
    expect(score.textContent).not.toMatch(/\/\s?100|\d+\s?points?/)
    expect(within(score).getByRole('list', { name: 'Ce que la fiche sait, axe par axe' })).toBeInTheDocument()
    expect(score.textContent).toMatch(/Renseigné|À compléter/)
    expect(score.textContent).toContain('âge, genre, origine, photo, adresse')
  })
})

/**
 * #4576 — CHAQUE INFORMATION UNE SEULE FOIS. Mesuré sur l'écran RENDU (pas sur le modèle) : la capture de Louis
 * montrait les mêmes cinq lignes de disponibilité dans l'en-tête ET dans l'onglet Profil, et « Consultant » deux fois.
 */
/** Les blocs de disponibilité DÉCLARÉE rendus dans `root` : le texte « gagne sur le planning » n'est écrit que par eux. */
function availabilityBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
    node => node.children.length === 0 && node.textContent === 'Déclarée — gagne sur le planning',
  )
}
/** Les étiquettes dont le texte est EXACTEMENT « Consultant » (la nature de la fiche) — hors champs modifiables,
 *  où « Nature : Consultant » est une VALEUR à corriger, pas une seconde étiquette. */
function kindBadges(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
    node =>
      node.children.length === 0 &&
      node.textContent === 'Consultant' &&
      node.closest('[data-testid^="talent-fields-"]') === null,
  )
}

describe('#4576 — la fiche ne dit rien deux fois', () => {
  it('le bloc de disponibilité n’est rendu qu’UNE fois sur la page, et pas dans l’en-tête', () => {
    const { container } = render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(availabilityBlocks(container)).toHaveLength(1)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(availabilityBlocks(header)).toHaveLength(0)
    expect(screen.getByTestId('talent-availability-line')).toContainElement(availabilityBlocks(container)[0] ?? null)
  })

  it('sait dire NON — le bloc remis une seconde fois est attrapé', () => {
    const { container } = render(<TalentDetailPage talentId={TALENT_ID} />)
    const block = availabilityBlocks(container)[0]
    expect(block).toBeDefined()
    const copy = block?.cloneNode(true)
    if (copy) screen.getByRole('region', { name: 'Nadia Berrada' }).appendChild(copy)
    expect(availabilityBlocks(container)).toHaveLength(2)
  })

  it('l’en-tête garde le statut (coup d’œil) : la disponibilité n’y disparaît pas, elle y est résumée', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toMatch(/Disponible|Disponibilité à vérifier|Fiche incomplète|En mission|Positionné/)
  })

  it('sans ligne de vivier lue, l’en-tête dit qu’il lit (la ligne du Profil n’existe pas encore)', () => {
    row = undefined
    rowIsLoading = true
    render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Je lis ses affectations')
  })

  it('« Consultant » ne s’écrit qu’UNE fois, dans la ligne d’identité de l’en-tête', () => {
    const { container } = render(<TalentDetailPage talentId={TALENT_ID} />)
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(kindBadges(container)).toHaveLength(1)
    expect(kindBadges(header)).toHaveLength(1)
  })

  it('sait dire NON — une puce « Consultant » de plus est attrapée', () => {
    const { container } = render(<TalentDetailPage talentId={TALENT_ID} />)
    const extra = document.createElement('span')
    extra.textContent = 'Consultant'
    container.appendChild(extra)
    expect(kindBadges(container)).toHaveLength(2)
  })
})

describe('#4577 — corriger sur place, selon le droit d’écrire', () => {
  afterEach(() => {
    workspaceAccess = { status: 'known', role: 'sales', extraPermissions: [], permissions: ['records:write'] }
  })

  it('avec le droit d’écrire, TJM, disponibilité, coordonnées et intitulé sont des boutons « Modifier »', () => {
    render(<TalentDetailPage talentId={TALENT_ID} />)
    for (const label of ['Intitulé de poste', 'Disponibilité', 'Email', 'Téléphone', 'TJM']) {
      expect(screen.getAllByRole('button', { name: new RegExp(`^Modifier ${label}`) }).length).toBeGreaterThan(0)
    }
  })

  it('SANS le droit d’écrire (viewer), aucun geste « Modifier » : la valeur se lit, rien ne promet une écriture', () => {
    workspaceAccess = { status: 'known', role: 'viewer', extraPermissions: [], permissions: [] }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.queryAllByRole('button', { name: /^Modifier / })).toHaveLength(0)
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0)
  })

  it('droit encore inconnu (chargement) : fail-closed, aucun geste d’écriture', () => {
    workspaceAccess = { status: 'unknown' }
    render(<TalentDetailPage talentId={TALENT_ID} />)
    expect(screen.queryAllByRole('button', { name: /^Modifier / })).toHaveLength(0)
  })
})
