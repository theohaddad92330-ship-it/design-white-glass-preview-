import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Consultant } from '@bellum/contracts'

// #4198 (L7) — la zone « Objets liés » lit une requête : sans ce double, ce fichier devrait porter un QueryClientProvider.
// #4051 — la ligne d'origine lit une requête : doublée ici.
vi.mock('./ConsultantImportMark', () => ({ ConsultantImportMark: () => null }))
vi.mock('@/features/records/useRecordLinks', () => ({ useRecordLinks: () => ({ data: undefined }) }))
vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => ({ data: null }) }))

/**
 * LE GESTE PROMIS PAR LE FORMULAIRE EST ATTEIGNABLE (PDF-02 §3.2 / §3.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PHRASE, ET L'ÉCRAN QUI NE LA TENAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le formulaire d'enregistrement écrit, sous le champ « Compétences » :
 *
 *   « Chacune est enregistrée au niveau "inconnu", source "déclaré" — le niveau
 *     et la source se précisent ensuite dans l'onglet Compétences de la fiche. »
 *
 * Cet onglet-là était en LECTURE SEULE. Le seul chemin d'édition partait d'un
 * bouton de la LIGNE du vivier : il fallait revenir en arrière pour faire ce que
 * la phrase venait de promettre. C'est la cause racine « une réponse juste sans
 * chemin », et elle coûte double ici — le geste manquant est précisément celui
 * qui remplace un niveau « inconnu » par une évaluation, c'est-à-dire ce qui
 * rend le profil évaluable au matching.
 *
 * ⚠️ Ce test RENDU plutôt que lu : une garde qui lirait le fichier à la
 * recherche de `<TalentSkillsDialog` verrait le composant monté et ne verrait
 * pas qu'aucun bouton ne l'ouvre. Le dépôt a déjà payé cette confusion (un
 * `disabled` avait rendu un glisser-déposer inerte sous une garde verte).
 */

const TALENT = {
  id: 'c-1',
  full_name: 'Nadia Berrada',
  title: 'SRE',
  seniority: 'senior',
  years_experience: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie',
  availability: 'immediate',
  zones: [],
  sectors: [],
  languages: [],
  clearances: [],
  stack: [],
  review_status: 'qualified',
  archived_at: null,
  contact_visible: true,
  finance_visible: false,
  email: null,
  phone: null,
  wants: null,
  consent_given_at: null,
  consent_expires_at: null,
  consent: { givenAt: null, expiresAt: null, basis: null },
} as unknown as Consultant

vi.mock('../../talent-api', () => ({
  useTalentSkills: () => ({ data: [], isLoading: false, isError: false }),
  useTalentExperiences: () => ({ data: [] }),
  // #2185.22 — la fiche en six onglets monte l'identité dans « Profil ».
  useTalentIdentity: () => ({ data: { state: 'new', items: [] }, isLoading: false, isError: false }),
  useTalentIdentityPreview: () => ({ data: undefined, isLoading: false }),
  useDecideTalentIdentity: () => ({ mutate: vi.fn(), isPending: false }),
  useUndoTalentIdentity: () => ({ mutate: vi.fn(), isPending: false }),
  useTalentDocuments: () => ({ data: [], isError: false }),
  useUpsertTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentSkill: () => ({ mutate: vi.fn() }),
  useValidateTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useAddTalentDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentDocument: () => ({ mutate: vi.fn() }),
  // Le dépôt de photo (31/08/2026) : `TalentDetailPage` monte désormais
  // `TalentPhotoUpload`, qui appelle ce hook.
  useSetTalentPhoto: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // La fiche monte `TalentPrepareMessageDialog`, qui lit ces trois hooks (#4347 : la rédaction de Laura).
  usePrepareTalentMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTalentPreparedMessages: () => ({ data: [] }),
  useDraftTalentMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #2185.10 — l'en-tête « Suivi par » lit les membres de l'espace.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [], isLoading: false, isError: false }),
}))
// #4577 — corriger exige `records:write` : ici, le droit est donné (le refus se teste dans `TalentDetail.test.tsx`).
vi.mock('@/lib/permissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  useUserPermissions: () => ({ status: 'known', role: 'sales', extraPermissions: [], permissions: ['records:write'] }),
}))
vi.mock('../../hooks', () => ({
  useConsultant: () => ({ data: TALENT, isLoading: false, isError: false }),
  useTalentSummary: () => ({ data: undefined, isLoading: true, isError: false }),
  useUpdateConsultant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveTalent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReactivateTalent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTalentOwner: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useConfirmTalentAvailability: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  // #2948 (#2329.47/.51) — l'onglet Profil (non mocké ici) monte aussi ces
  // deux actions, même raison que `useConfirmTalentAvailability` ci-dessus.
  useConfirmTjmValidated: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useConfirmCvValidated: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRecordInterviewTrait: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRecordRampUp: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  // #3406 — `TalentProfileTab` monte aussi le renseignement terrain.
  useRecordFieldReport: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useTalentMissions: () => ({ data: [] }),
  // ⚠️ `vi.mock` remplace le module ENTIER : un export oublié n'est pas
  // « laissé tel quel », il n'existe plus. `TalentDetailPage` lit le vivier
  // (#2195.12, les managers candidats) depuis ce même module.
  useConsultants: () => ({ data: [] }),
  // #2570 — l'onglet Profil (non mocké ici) monte `TalentEnrichAction`, qui
  // lit ce hook au premier rendu ; sans lui, un export « oublié » n'existe
  // plus dans le module remplacé (voir la note juste au-dessus).
  useEnrichTalent: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
  }),
  // #3831.1 — l'onglet Profil (non mocké ici) monte aussi `TalentEnrichAction`,
  // qui lit ce hook pour la recherche sans profil professionnel connu.
  useSearchTalentByName: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
  }),
  // #2375.x — `TalentAddToNeedDialog` (monté par `TalentDetailPage`, voir la
  // note « module ENTIER » ci-dessus) lit ce hook pour son picker de besoin.
  useOpportunitiesForMatch: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/features/submissions/api', () => ({
  useSubmissions: () => ({ data: { items: [] } }),
  // Même raison que `useOpportunitiesForMatch` juste au-dessus : la MÊME
  // écriture que `TalentAddToNeedDialog` réutilise (#2375.1).
  useCreateSubmission: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))
vi.mock('@/features/crm-core/view/NotesPanel', () => ({ NotesPanel: () => null }))
vi.mock('@/features/matching/view/InverseMatchPanel', () => ({ InverseMatchPanel: () => null }))
vi.mock('../ConsultantEngagementBanner', () => ({ ConsultantEngagementBanner: () => null }))
vi.mock('../parse/CvReviewPanel', () => ({ CvReviewPanel: () => null }))
vi.mock('../studio/CvStudioPanel', () => ({ CvStudioPanel: () => null }))
vi.mock('./TalentConsentTab', () => ({ TalentConsentTab: () => null }))
vi.mock('./TalentRatesTab', () => ({ TalentRatesTab: () => null }))
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

afterEach(cleanup)

describe('la région Compétences de la fiche (dans Profil — Théo C talents-fiche.R4) ouvre le panneau qui les précise', () => {
  it('porte un geste, et il est TABULABLE — un onglet qui ne fait que lire ne tient pas la phrase du formulaire', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId="c-1" />)

    const action = screen.getByRole('button', { name: /préciser les compétences/i })
    expect(action).toBeTruthy()
    // `<button type="button">` et non un `<div onClick>` : ce qui se clique se
    // tabule (GA-35).
    expect(action.tagName).toBe('BUTTON')
  })

  it('OUVRE réellement le panneau — un bouton monté qui n’ouvre rien passerait une garde de source', async () => {
    const user = userEvent.setup()
    render(<TalentDetailPage talentId="c-1" />)

    // Avant le clic : aucun champ de saisie de compétence à l'écran.
    expect(screen.queryByRole('combobox', { name: /source/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: /préciser les compétences/i }))

    // Après : le panneau est là, avec ses deux axes — le niveau ET la source.
    expect(screen.getByRole('combobox', { name: /source/i })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /^Compétence$/ })).toBeTruthy()
  })

  it('sait dire NON — le panneau ne s’ouvre pas tout seul', () => {
    // Sans cette assertion, un panneau monté ouvert ferait passer le test
    // au-dessus sans qu'aucun geste n'existe.
    render(<TalentDetailPage talentId="c-1" />)
    expect(screen.queryByRole('combobox', { name: /source/i })).toBeNull()
  })
})
