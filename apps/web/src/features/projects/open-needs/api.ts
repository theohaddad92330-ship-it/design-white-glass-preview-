import type {
  CommercialTransitionSource,
  CompiledNeed,
  CreateNeedStepInput,
  ExternalSourcingImportInput,
  ExternalSourcingImportResult,
  ExternalSourcingPartnerBrief,
  ExternalSourcingPartnerBriefFeedbackInput,
  ExternalSourcingPartnerBriefPrepareInput,
  ExternalSourcingSearchResult,
  NeedExportRequest,
  NeedDocument,
  NeedStep,
  NeedQualificationResponse,
  NeedStoredStatus,
  NeedVerdictResponse,
  OpenNeedsCommercialAuditSignals,
  OpenNeedsQuery,
  OpenNeedsResponse,
  ProjectNeed,
  ReverseProspectMatch,
  ReverseProspectsResult,
  RfpNeedPreview,
  UpdateNeedStepInput,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export type { ReverseProspectMatch, ReverseProspectsResult }

export const openNeedsKeys = {
  all: ['open-needs'] as const,
  list: (query: OpenNeedsQuery) => ['open-needs', 'list', query] as const,
  commercialAuditSignals: ['open-needs', 'commercial-audit-signals'] as const,
}

/** « Tous les rôles que tes clients cherchent en ce moment » (PDF 2 §7.5). */
export const openNeedsApi = {
  list: (query: OpenNeedsQuery): Promise<OpenNeedsResponse> => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      params.set(key, String(value))
    }
    return apiFetch<OpenNeedsResponse>({ path: `/projects/needs?${params.toString()}` })
  },
  /** #2842 (reste, 26/09) — `clientNeeds`/`needDetailing` de l'audit commercial. */
  commercialAuditSignals: (): Promise<OpenNeedsCommercialAuditSignals> =>
    apiFetch<OpenNeedsCommercialAuditSignals>({ path: '/projects/needs/commercial-audit-signals' }),
  /**
   * #4016 L11 — l'export de masse de la sélection (CSV ou JSON). La SEULE
   * sortie de cet écran, et elle passe par la règle d'espace (`@DataExit()`
   * côté API) : un refus revient en `workspace_rule_refused`, jamais en fichier
   * vide.
   */
  exportSelection: (request: NeedExportRequest): Promise<string> =>
    apiFetch<string, NeedExportRequest>({
      path: NEED_EXPORT_PATH,
      method: 'POST',
      body: request,
      responseType: 'text',
    }),
}

/** #4016 L11 — la route d'export de masse, gouvernée par `@DataExit()` (garde `need-actions.test.ts`). */
export const NEED_EXPORT_PATH = '/projects/needs/export'

/**
 * #2939 (#2174.3/.5) — COLLER UN BRIEF OU UN E-MAIL à l'étape 1 de l'assistant
 * de création. Le MÊME outil de compilation que la carte de Laura
 * (`compile_need`, apps/ia) — jamais un second chemin.
 *
 * `refused` couvre un motif MÉTIER (`compile_need` a dit non : source
 * illisible, tableur, aucune valeur citée) ; `unavailable` couvre le
 * TRANSPORT. Les deux laissent l'étape 1 continuer à la main.
 */
type NeedCompileTextResult =
  | { status: 'ok'; compiled: CompiledNeed; dropped: { field: string; reason: string }[] }
  | { status: 'refused'; error: string }
  | { status: 'unavailable'; error: string }

export const needCompileTextApi = {
  compile: (text: string, sourceKind: 'free_brief' | 'email'): Promise<NeedCompileTextResult> =>
    apiFetch<NeedCompileTextResult, { text: string; sourceKind: 'free_brief' | 'email' }>({
      path: '/projects/needs/compile-text',
      method: 'POST',
      body: { text, sourceKind },
    }),
}

/**
 * « Un besoin sans candidat ouvre une piste » — la réponse serveur, sa forme
 * portée par `@bellum/contracts` (`reverse-need-prospects.ts`, gardé par
 * GA-204). Elle était dupliquée localement ici et côté serveur
 * (`apps/api/src/modules/projects/reverse-need-prospects.ts`) — même champs,
 * aucun schéma commun ; ce n'est plus le cas.
 */
export const reverseProspectsApi = {
  get: (needId: string): Promise<ReverseProspectsResult> =>
    apiFetch<ReverseProspectsResult>({ path: `/projects/needs/${needId}/reverse-prospects` }),
}

/**
 * Sourcing externe de consultants (#2818) — « Chercher hors vivier », lancée
 * depuis un besoin. Voir le docblock de `external-sourcing.ts`
 * (`@bellum/contracts`) pour la décision produit complète.
 */
export const externalSourcingApi = {
  /** `maxPerSource` : le volume choisi AVANT LANCEMENT (#2190.12) — omis, le
   *  serveur applique son réglage par défaut (`EXTERNAL_SOURCING_SOURCE_LIMIT`). */
  search: (needId: string, maxPerSource?: number): Promise<ExternalSourcingSearchResult> => {
    const params = new URLSearchParams()
    if (maxPerSource !== undefined) params.set('maxPerSource', String(maxPerSource))
    const query = params.toString()
    return apiFetch<ExternalSourcingSearchResult>({
      path: `/projects/needs/${needId}/external-sourcing/search${query.length > 0 ? `?${query}` : ''}`,
    })
  },
  import: (needId: string, input: ExternalSourcingImportInput): Promise<ExternalSourcingImportResult> =>
    apiFetch<ExternalSourcingImportResult, ExternalSourcingImportInput>({
      path: `/projects/needs/${needId}/external-sourcing/import`,
      method: 'POST',
      body: input,
    }),
  listPartnerBriefs: (needId: string): Promise<ExternalSourcingPartnerBrief[]> =>
    apiFetch<ExternalSourcingPartnerBrief[]>({ path: `/projects/needs/${needId}/external-sourcing/partner-briefs` }),
  preparePartnerBrief: (
    needId: string,
    input: ExternalSourcingPartnerBriefPrepareInput,
  ): Promise<ExternalSourcingPartnerBrief> =>
    apiFetch<ExternalSourcingPartnerBrief, ExternalSourcingPartnerBriefPrepareInput>({
      path: `/projects/needs/${needId}/external-sourcing/partner-briefs`,
      method: 'POST',
      body: input,
    }),
  recordPartnerBriefFeedback: (
    needId: string,
    briefId: string,
    input: ExternalSourcingPartnerBriefFeedbackInput,
  ): Promise<ExternalSourcingPartnerBrief> =>
    apiFetch<ExternalSourcingPartnerBrief, ExternalSourcingPartnerBriefFeedbackInput>({
      path: `/projects/needs/${needId}/external-sourcing/partner-briefs/${briefId}/feedback`,
      method: 'POST',
      body: input,
    }),
}

/** Un besoin PROPOSÉ par l'analyse, en attente d'un geste. */
export type NeedProposal = {
  id: string
  account_id: string
  title: string
  skills: string[]
  location: string | null
  source_url: string | null
  detected_at: string | null
  created_at: string
}

/**
 * Les propositions ne sont PAS dans le pipe (PDF 4, PE5).
 *
 * C'est la distinction que l'écran sert à montrer : ce que l'outil a vu n'est
 * pas encore un besoin, et quelqu'un doit dire oui. Un pipe qui se remplirait
 * tout seul de besoins non validés deviendrait inutilisable en une semaine.
 */
export const needProposalsApi = {
  list: (): Promise<{ items: NeedProposal[] }> =>
    apiFetch<{ items: NeedProposal[] }>({ path: '/projects/needs/proposals' }),
  /**
   * #2647.1 — les mêmes propositions, CLOISONNÉES à un seul compte : la
   * section « Besoins » en tête du dossier compte. `list()` ci-dessus lit
   * tout l'espace (la vue transverse BEL-CRM-101) — deux comptes du même
   * espace ne doivent jamais partager la même liste.
   */
  listForAccount: (accountId: string): Promise<{ items: NeedProposal[] }> =>
    apiFetch<{ items: NeedProposal[] }>({ path: `/projects/needs/proposals/account/${accountId}` }),
  accept: (proposalId: string, projectId: string) =>
    apiFetch<{ id: string }, { projectId: string }>({
      path: `/projects/needs/proposals/${proposalId}/accept`,
      method: 'POST',
      body: { projectId },
    }),
  dismiss: (proposalId: string, reason: string) =>
    apiFetch<{ id: string }, { reason: string }>({
      path: `/projects/needs/proposals/${proposalId}/dismiss`,
      method: 'POST',
      body: { reason },
    }),
}

/** Les documents d'un besoin — devis, NDA, contrat cadre — et leur statut. */
export const needDocumentsKeys = {
  list: (needId: string) => ['open-needs', needId, 'documents'] as const,
}
export const needDocumentsApi = {
  list: (needId: string): Promise<{ items: NeedDocument[] }> =>
    apiFetch<{ items: NeedDocument[] }>({ path: `/projects/needs/${needId}/documents` }),
}

/** Les « prochaines étapes » cochables d'un besoin — distinctes de
 *  `needNextAction`, une dérivation non persistée. */
export const needStepsKeys = {
  list: (needId: string) => ['open-needs', needId, 'steps'] as const,
}
export const needStepsApi = {
  list: (needId: string): Promise<{ items: NeedStep[] }> =>
    apiFetch<{ items: NeedStep[] }>({ path: `/projects/needs/${needId}/steps` }),
  create: (needId: string, input: CreateNeedStepInput): Promise<NeedStep> =>
    apiFetch<NeedStep, CreateNeedStepInput>({
      path: `/projects/needs/${needId}/steps`,
      method: 'POST',
      body: input,
    }),
  update: (needId: string, stepId: string, input: UpdateNeedStepInput): Promise<NeedStep> =>
    apiFetch<NeedStep, UpdateNeedStepInput>({
      path: `/projects/needs/${needId}/steps/${stepId}`,
      method: 'PATCH',
      body: input,
    }),
}

/**
 * Refonte Théo — fiche besoin (`affaires/besoin.html`, AFFAIRES-B4 / B5) : « Avant la mission » et
 * « Doublons ». Deux LECTURES de calculs déjà faits côté API (`NeedCommercialStateService`).
 */
type NeedHandoffCheck = {
  needId: string
  status: string
  allowed: boolean
  missing: string[]
  existingMissionId: string | null
}
type NeedDuplicates = {
  needId: string
  candidates: { needId: string; title: string; status: string; reason: 'meme_intitule' | 'competences_communes' }[]
}
export const needReadinessKeys = {
  handoff: (needId: string) => ['open-needs', needId, 'handoff-check'] as const,
  duplicates: (needId: string) => ['open-needs', needId, 'duplicates'] as const,
}
export const needReadinessApi = {
  handoff: (needId: string): Promise<NeedHandoffCheck> =>
    apiFetch<NeedHandoffCheck>({ path: `/projects/needs/${needId}/handoff-check` }),
  duplicates: (needId: string): Promise<NeedDuplicates> =>
    apiFetch<NeedDuplicates>({ path: `/projects/needs/${needId}/duplicates` }),
}

/**
 * LE VERDICT « GO / NO-GO » d'un besoin — six axes, trois issues.
 *
 * Une LECTURE : elle ne lance aucun rapprochement, elle relit le dernier déjà
 * exécuté (voir `NeedVerdictService` côté API). C'est pourquoi elle passe par
 * `useQuery` et non par une mutation, contrairement à `useRunMatch`.
 */
export const needVerdictKeys = {
  get: (needId: string) => ['open-needs', needId, 'verdict'] as const,
}
export const needVerdictApi = {
  get: (needId: string): Promise<NeedVerdictResponse> =>
    apiFetch<NeedVerdictResponse>({ path: `/projects/needs/${needId}/verdict` }),
}

/**
 * #2323.32/.34/.35/.36 / #2323.38-.45 — LA QUESTION PRIORITAIRE PAR AXE, ET
 * LES CONTRADICTIONS DÉTECTÉES. Même patron que `needVerdictApi` juste
 * au-dessus, pour la même raison : une LECTURE, `useQuery`, jamais une
 * mutation.
 */
export const needQualificationKeys = {
  get: (needId: string) => ['open-needs', needId, 'qualification'] as const,
}
export const needQualificationApi = {
  get: (needId: string): Promise<NeedQualificationResponse> =>
    apiFetch<NeedQualificationResponse>({ path: `/projects/needs/${needId}/qualification` }),
}

/** L'Historique d'un besoin — ce qui a été DÉCIDÉ dessus (les franchissements
 *  de porte, `apps/api/src/modules/decision-gates`), le plus récent d'abord. */
type NeedHistoryCrossing = {
  id: string
  gate: string
  decision: string
  reason: string | null
  missing: string[]
  created_at: string
}
export const needHistoryKeys = {
  list: (needId: string) => ['open-needs', needId, 'history'] as const,
}
/**
 * #2967 (lot V39, #2320.23 / #2320.30) — le JOURNAL des changements d'état
 * d'un besoin (`commercial_transitions`, sujet `need`), servi par
 * `GET /projects/needs/:id/status-history` : de→vers, preuve, SOURCE (geste,
 * proposition de Laura validée, correction humaine) et stade CANONIQUE.
 */
type NeedStatusTransition = {
  id: string
  fromState: string | null
  toState: string
  actorId: string | null
  proof: string | null
  source: CommercialTransitionSource
  toStage: string | null
  occurredAt: string
}
export const needStatusHistoryKeys = {
  list: (needId: string) => ['open-needs', needId, 'status-history'] as const,
}
export const needStatusHistoryApi = {
  list: (needId: string): Promise<{ items: NeedStatusTransition[] }> =>
    apiFetch<{ items: NeedStatusTransition[] }>({ path: `/projects/needs/${needId}/status-history` }),
}

export const needHistoryApi = {
  list: (needId: string): Promise<{ crossings: NeedHistoryCrossing[] }> =>
    apiFetch<{ crossings: NeedHistoryCrossing[] }>({ path: `/projects/needs/${needId}/history` }),
}

/**
 * #2571 — un appel d'offres transféré devient un besoin EN PRÉVISUALISATION.
 *
 * `preview` est une LECTURE pure : rien n'existe encore côté serveur. `confirm`
 * est la SEULE porte d'écriture (`POST /rfp/:id/need`, #1097/#2571.2) — le
 * projet est choisi par l'utilisateur, jamais deviné.
 */
export const rfpNeedPreviewApi = {
  preview: (rfpId: string): Promise<RfpNeedPreview> => apiFetch<RfpNeedPreview>({ path: `/rfp/${rfpId}/need-preview` }),
  confirm: (rfpId: string, projectId: string): Promise<ProjectNeed> =>
    apiFetch<ProjectNeed, { projectId: string }>({
      path: `/rfp/${rfpId}/need`,
      method: 'POST',
      body: { projectId },
    }),
}

/**
 * #2320.26/.27 (épopée #2967) — LA PORTE D'ÉTAT D'UN BESOIN, séparée du patch
 * générique côté serveur (`PATCH /projects/needs/:id/status`) : le statut est
 * le seul champ dont un mauvais réglage déplace du travail sans que personne
 * ne l'ait décidé. Même route que `useNeedActions` (`changeStatus`), exposée
 * ici pour que `PendingActions.tsx` (carte `propose_need_transition`) l'appelle
 * sans dupliquer l'URL.
 */
export const needStatusApi = {
  /** #2967 (lot V39) — `source` : `laura` quand le clic VALIDE une proposition
   *  de Laura (le journal le dit), absent = un geste ordinaire (`human`). */
  change: (
    needId: string,
    status: NeedStoredStatus,
    reason: string | null,
    source?: CommercialTransitionSource,
  ): Promise<ProjectNeed> =>
    apiFetch<ProjectNeed, { status: NeedStoredStatus; reason: string | null; source?: CommercialTransitionSource }>({
      path: `/projects/needs/${needId}/status`,
      method: 'PATCH',
      body: source ? { status, reason, source } : { status, reason },
    }),
}

/**
 * #1952.3 (épopée #2844, lot P07 30/09) — LANCER le matching massif de plusieurs
 * besoins, en tâche de fond. Le moteur (`POST needs/match/bulk`, file
 * `bulk-matching`) était livré sans appelant web : le clic sur la carte
 * `propose_long_job` de Laura est ce premier appelant.
 */
export const bulkMatchingApi = {
  enqueue: (needIds: readonly string[]): Promise<{ id: string; status: string }> =>
    apiFetch<{ id: string; status: string }, { needIds: readonly string[] }>({
      path: '/needs/match/bulk',
      method: 'POST',
      body: { needIds },
    }),
}

/** #1952.7 — la recherche hors vivier d'UN besoin, en tâche de fond (`search/bulk`). */
export function startExternalSourcingSearchJob(
  needId: string,
  maxPerSource?: number,
): Promise<{ id: string; status: string }> {
  const query = maxPerSource !== undefined ? `?maxPerSource=${maxPerSource}` : ''
  return apiFetch<{ id: string; status: string }>({
    path: `/projects/needs/${needId}/external-sourcing/search/bulk${query}`,
    method: 'POST',
  })
}
