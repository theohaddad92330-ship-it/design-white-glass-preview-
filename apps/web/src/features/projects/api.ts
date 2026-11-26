import type {
  Btmmp,
  ForecastCategory,
  CreateProject,
  CreateProjectDocumentInput,
  CreateProjectStepInput,
  PipelineSummary,
  ProjectCrmExportResponse,
  ProjectDocument,
  ProjectDocumentStatus,
  ProjectStage,
  ProjectReadinessRow,
  ProjectRow,
  ProjectSimilarResponse,
  ProjectStep,
  ProjectSynthesis,
  UpdateProjectSectors,
  UpdateProjectStepInput,
} from '@bellum/contracts'
import type {
  CaseBuyingModel,
  CaseOrganisation,
  CaseStrategy,
  LossReasonCode,
  StageMoveOutcome,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Le projet déplacé, ET ce que le déplacement a réellement fait. */
type StageMoveResponse = { project: ProjectRow; actions: StageMoveOutcome }

/** Montant en euros, ou `null` pour effacer le champ (jamais un 0 par défaut). */
type AmountBody = { estimated_amount: number | null }
/** #2324.37 */
type RisksBody = { risks: string | null }

/**
 * La portée qu'un appelant DEMANDE sur le pipe — à ne pas confondre avec le
 * `scope` que la réponse RETOURNE (`PipelineSummaryResponse.scope`, ce que le
 * serveur a réellement appliqué).
 *
 * Une seule valeur existe, comme sur `FinanceScopeRequest`
 * (`features/missions/api.ts`) : il n'y a pas de `'workspace'` explicite, parce
 * que le serveur n'en connaît pas — l'espace est ce qu'il rend quand on ne
 * demande rien. Inventer la valeur ferait partir un paramètre que personne ne
 * lit.
 */
type PipelineScopeRequest = 'own'

/**
 * Construit la requête du pipe. Un seul endroit fabrique cette URL — même
 * raison que `scopedPath` dans `features/missions/api.ts` : un appelant qui la
 * recopierait à la main est la façon dont un paramètre finit par manquer.
 */
function pipelinePath(language: 'fr' | 'en', scope?: PipelineScopeRequest): string {
  const params = new URLSearchParams({ lang: language })
  if (scope) params.set('scope', scope)
  return `/projects/pipeline?${params.toString()}`
}

/**
 * Opportunity Graph (restitution V2 §6-7) — the materialized, lifecycle-tracked
 * layer over the portfolio's besoins. Its own base path `/opportunities`.
 */
export const projectsApi = {
  /**
   * Portfolio-wide materialized opportunities, workspace-scoped, newest first.
   *
   * #2170.20 — `ProjectReadRow[]`, pas `ProjectRow[]` : la route sert déjà
   * `evidence` (niveau de preuve, `withEvidence` côté API) et un typage plus
   * étroit ici l'effaçait avant que `PipelineBoard` ne puisse le lire.
   */
  list(): Promise<ProjectReadinessRow[]> {
    return apiFetch<ProjectReadinessRow[]>({ path: '/projects' })
  },
  /**
   * #4137 — les dossiers ARCHIVÉS de l'espace seulement (`?archived=only`). On
   * archive, on ne supprime pas : ce sont les mêmes lignes que `list`, rangées.
   */
  listArchived(): Promise<ProjectReadinessRow[]> {
    return apiFetch<ProjectReadinessRow[]>({ path: '/projects?archived=only' })
  },
  /**
   * #2801 — LA MÊME liste, resserrée par `?id=` : ce que lit le DOSSIER
   * (`/projects/$id`). Même précédent que `missionsApi` (`GET
   * /delivery/missions?id=…`) — un second `SELECT` par identifiant aurait
   * fabriqué une seconde vérité pour le même projet.
   */
  byId(id: string): Promise<ProjectReadinessRow[]> {
    return apiFetch<ProjectReadinessRow[]>({ path: `/projects?id=${id}` })
  },
  /**
   * L'état du pipe : cinq colonnes, leurs projets, leurs montants — celui de
   * l'ESPACE par défaut, celui du LECTEUR si `scope: 'own'` est demandé.
   *
   * ⚠️ Le cockpit annonce « **Mon** pipe » : sans `scope: 'own'`, la promesse du
   * titre était fausse — le même chiffre d'espace s'affichait sous « Mon » pour
   * chaque commercial (fix `a1f30e39b`, où le serveur a appris `?scope=own` sans
   * qu'aucun appelant web ne le demande jamais). `/projects` (le pipe complet)
   * et l'état vide de `/missions` (ce que l'ESPACE a gagné) continuent d'appeler
   * SANS portée — c'est le comportement historique, inchangé.
   */
  pipeline(language: 'fr' | 'en', scope?: PipelineScopeRequest): Promise<PipelineSummary> {
    return apiFetch<PipelineSummary>({ path: pipelinePath(language, scope) })
  },
  /**
   * Déplacer le projet dans son cycle. Le motif n'a de sens que pour « perdu » :
   * une perte sans raison n'apprend rien à personne — et le serveur le REFUSE
   * désormais (`updateProjectStageSchema`), d'où la question posée à l'écran.
   *
   * `accepted_actions` porte ce que l'utilisateur a coché dans le panneau
   * d'effets. Ce paramètre était le trou : le panneau cochait « créer la
   * mission » par défaut et l'appel partait sans, si bien qu'aucune mission
   * n'a jamais été créée par ce chemin.
   */
  updateStage(
    id: string,
    stage: ProjectStage,
    loss_reason: string | null = null,
    accepted_actions: readonly string[] = [],
    // #3246 (lot W9 + lot cloud 14/10) — absents du corps tant que l'utilisateur n'a rien choisi : le serveur ne touche alors à rien.
    caseDimensions: {
      strategy?: CaseStrategy | null
      buying_model?: CaseBuyingModel | null
      organisation?: CaseOrganisation | null
      /** #3989.9 (Louis 15/10/2026) — le motif de perte, liste FERMÉE commune. */
      loss_reason_code?: LossReasonCode | null
    } = {},
  ): Promise<StageMoveResponse> {
    return apiFetch<
      StageMoveResponse,
      {
        stage: ProjectStage
        loss_reason: string | null
        accepted_actions: string[]
        strategy?: CaseStrategy
        buying_model?: CaseBuyingModel
        organisation?: CaseOrganisation
        loss_reason_code?: LossReasonCode
      }
    >({
      path: `/projects/${id}/stage`,
      method: 'PATCH',
      body: {
        stage,
        loss_reason,
        accepted_actions: [...accepted_actions],
        ...(caseDimensions.strategy ? { strategy: caseDimensions.strategy } : {}),
        ...(caseDimensions.buying_model ? { buying_model: caseDimensions.buying_model } : {}),
        ...(caseDimensions.organisation ? { organisation: caseDimensions.organisation } : {}),
        ...(caseDimensions.loss_reason_code ? { loss_reason_code: caseDimensions.loss_reason_code } : {}),
      },
    })
  },
  /**
   * #2195.33 — OUVRIR UNE AFFAIRE. La porte que le pipe n'avait pas.
   *
   * ⚠️ Appelée UNIQUEMENT depuis le formulaire de création, c'est-à-dire après
   * un clic. Le bouton « construire la proposition » du panneau de
   * renouvellement NAVIGUE vers ce formulaire pré-rempli, il n'appelle jamais
   * cette fonction : **on ne crée jamais une affaire tout seul.**
   *
   * `renewal_linked` dit si le lien vers la mission renouvelée a pu être posé.
   * L'écran le LIT plutôt que de le supposer — une affaire créée dont le lien
   * a échoué doit se dire, sinon on laisse croire à un rattachement qui n'a
   * pas eu lieu.
   */
  create(body: CreateProject): Promise<{ project: ProjectRow; renewal_linked: boolean }> {
    return apiFetch<{ project: ProjectRow; renewal_linked: boolean }, CreateProject>({
      path: '/projects',
      method: 'POST',
      body,
    })
  },
  /** Les motifs de perte déjà utilisés dans l'espace. PROPOSÉS, jamais imposés :
   *  une liste fermée pousse à cocher « Autre », qui n'apprend rien. */
  listLossReasons(): Promise<{ items: Array<{ id: string; label: string }> }> {
    return apiFetch<{ items: Array<{ id: string; label: string }> }>({ path: '/projects/loss-reasons' })
  },
  /**
   * Saisir/effacer le montant d'affaire estimé (cockpit manager §10 — pipeline
   * valorisé). `estimated_amount: null` efface. Aucun crédit débité : c'est une
   * saisie manuelle, jamais un enrichissement.
   */
  updateAmount(id: string, estimated_amount: number | null): Promise<ProjectRow> {
    return apiFetch<ProjectRow, AmountBody>({
      path: `/projects/${id}/amount`,
      method: 'PATCH',
      body: { estimated_amount },
    })
  },
  /** #3246 — stratégie / modèle d'achat d'une affaire (null = jamais saisi). */
  readCaseDimensions(id: string): Promise<CaseDimensions> {
    return apiFetch<CaseDimensions>({ path: `/projects/${id}/case-dimensions` })
  },
  /** #3246 — n'écrit QUE les clés fournies ; `null` efface. Ne touche jamais à l'étape. */
  updateCaseDimensions(id: string, patch: CaseDimensionsPatch): Promise<CaseDimensions> {
    return apiFetch<CaseDimensions, CaseDimensionsPatch>({
      path: `/projects/${id}/case-dimensions`,
      method: 'PATCH',
      body: patch,
    })
  },
  /** #2324.37 — saisir/effacer les risques de l'affaire (`null` efface). */
  updateRisks(id: string, risks: string | null): Promise<ProjectRow> {
    return apiFetch<ProjectRow, RisksBody>({
      path: `/projects/${id}/risks`,
      method: 'PATCH',
      body: { risks },
    })
  },
  /** L2 Pipe — la catégorie DÉCLARÉE du commercial (`null` efface). Une déclaration, jamais une probabilité. */
  updateForecastCategory(id: string, category: ForecastCategory | null): Promise<ProjectRow> {
    return apiFetch<ProjectRow, { forecast_category: ForecastCategory | null }>({
      path: `/projects/${id}/forecast-category`,
      method: 'PATCH',
      body: { forecast_category: category },
    })
  },
  /** La date de signature PRÉVUE (jour ISO), ou `null` pour l'effacer. Jamais déduite d'un cycle moyen. */
  updateCloseDate(id: string, date: string | null): Promise<ProjectRow> {
    return apiFetch<ProjectRow, { expected_close_on: string | null }>({
      path: `/projects/${id}/close-date`,
      method: 'PATCH',
      body: { expected_close_on: date },
    })
  },
  /**
   * #2170.26 — ATTRIBUER (ou retirer, avec `null`) le porteur d'une
   * opportunité. La route serveur (`PATCH /projects/:id/owner`) existait déjà
   * — `updateOwner` sur `ProjectsService`, appelée jusqu'ici seulement par la
   * conversion d'une piste — et n'avait aucun appelant web : le motif nommé
   * par `CLAUDE.md` (« du code juste, calculé, testé, que personne
   * n'appelle »).
   */
  updateOwner(id: string, owner_id: string | null): Promise<ProjectRow> {
    return apiFetch<ProjectRow, { owner_id: string | null }>({
      path: `/projects/${id}/owner`,
      method: 'PATCH',
      body: { owner_id },
    })
  },
  /**
   * #2939 (#2174.10) — RATTACHER LE PROJET à une entité du compte (filiale,
   * BU), depuis l'étape 1 de l'assistant de création d'un besoin.
   * `entity_id: null` détache — même geste que `PATCH /contacts/:id/entity`.
   */
  setEntity(id: string, entity_id: string | null): Promise<{ entity_id: string | null }> {
    return apiFetch<{ entity_id: string | null }, { entity_id: string | null }>({
      path: `/projects/${id}/entity`,
      method: 'PATCH',
      body: { entity_id },
    })
  },
  /**
   * The same need seen on the workspace's OTHER accounts (restitution V2 §7).
   * Read-only: nothing is written, no credit is spent — so no confirmation step.
   */
  similar(id: string): Promise<ProjectSimilarResponse> {
    return apiFetch<ProjectSimilarResponse>({ path: `/projects/${id}/similar` })
  },
  /**
   * Export a besoin to the connected CRM as its idiomatic object — a Deal
   * (HubSpot/Pipedrive), a Note on the Company (Attio) or a Task (Salesforce)
   * (Théo TF1 p39 — les connecteurs exportaient déjà un contact ; un besoin
   * n'avait aucun chemin). Only reachable on a MATERIALIZED besoin (it needs the
   * opportunity id). The server composes the record from the stored fields and
   * dispatches to whichever CRM is connected. A 409 means nothing is connected
   * yet — the hook turns that into an actionable "connect a CRM" prompt rather
   * than a raw error.
   */
  exportToCrm(id: string): Promise<ProjectCrmExportResponse> {
    return apiFetch<ProjectCrmExportResponse>({ path: `/projects/${id}/export-crm`, method: 'POST' })
  },
  /** #2171.39 — ARCHIVER / DÉSARCHIVER, un rangement NEUTRE : `stage`/`outcome`
   *  ne bougent pas, seul `archived_at` change. Rend la ligne à jour. */
  archiveOpportunity(id: string): Promise<ProjectRow> {
    return apiFetch<ProjectRow>({ path: `/projects/${id}/archive`, method: 'POST' })
  },
  unarchiveOpportunity(id: string): Promise<ProjectRow> {
    return apiFetch<ProjectRow>({ path: `/projects/${id}/unarchive`, method: 'POST' })
  },
  /** #2171.22 — les « prochaines étapes » cochables de l'opportunité, distinctes
   *  de `next_action` (une dérivation non persistée). */
  listSteps(id: string): Promise<{ items: ProjectStep[] }> {
    return apiFetch<{ items: ProjectStep[] }>({ path: `/projects/${id}/steps` })
  },
  createStep(id: string, input: CreateProjectStepInput): Promise<ProjectStep> {
    return apiFetch<ProjectStep, CreateProjectStepInput>({ path: `/projects/${id}/steps`, method: 'POST', body: input })
  },
  updateStep(id: string, stepId: string, input: UpdateProjectStepInput): Promise<ProjectStep> {
    return apiFetch<ProjectStep, UpdateProjectStepInput>({
      path: `/projects/${id}/steps/${stepId}`,
      method: 'PATCH',
      body: input,
    })
  },
  /**
   * #2171.27 — la synthèse en 7 questions de l'opportunité. Génération à la
   * demande, jamais persistée — voir le docblock de `ProjectSynthesisService`
   * (côté API) pour la raison. Un clic = un appel = une réponse à afficher,
   * rien à invalider en cache.
   */
  generateSynthesis(id: string): Promise<ProjectSynthesis> {
    return apiFetch<ProjectSynthesis>({ path: `/projects/${id}/synthesis`, method: 'POST' })
  },
  /** #2171.24 — les documents (devis, NDA, contrat cadre) suivis au niveau de
   *  L'AFFAIRE, distincts des `need_documents` d'un rôle précis. */
  listDocuments(id: string): Promise<{ items: ProjectDocument[] }> {
    return apiFetch<{ items: ProjectDocument[] }>({ path: `/projects/${id}/documents` })
  },
  createDocument(id: string, input: CreateProjectDocumentInput): Promise<ProjectDocument> {
    return apiFetch<ProjectDocument, CreateProjectDocumentInput>({
      path: `/projects/${id}/documents`,
      method: 'POST',
      body: input,
    })
  },
  updateDocumentStatus(id: string, documentId: string, status: ProjectDocumentStatus): Promise<ProjectDocument> {
    return apiFetch<ProjectDocument, { status: ProjectDocumentStatus }>({
      path: `/projects/${id}/documents/${documentId}/status`,
      method: 'PATCH',
      body: { status },
    })
  },
  /** Enregistre la qualification BTMMP d'un besoin (annexe méthodo p21). Fusion
   *  present-only : un axe absent n'écrase rien. */
  updateBtmmp(id: string, patch: Btmmp): Promise<ProjectRow> {
    return apiFetch<ProjectRow, Btmmp>({ path: `/projects/${id}/btmmp`, method: 'PATCH', body: patch })
  },
  /**
   * Le secteur d'APPLICATION de la demande et la famille de prestation achetée
   * (addendum Stelya §4.1). Remplacement complet des secteurs : `[]` efface,
   * et c'est le geste qu'on veut pouvoir faire quand on s'est trompé.
   */
  updateSectors(
    id: string,
    codes: readonly string[],
    primary_domain_code: UpdateProjectSectors['primary_domain_code'],
  ): Promise<ProjectRow> {
    return apiFetch<ProjectRow, UpdateProjectSectors>({
      path: `/projects/${id}/sectors`,
      method: 'PATCH',
      body: { application_sector_codes: [...codes], primary_domain_code },
    })
  },
}

type CaseDimensions = {
  strategy: CaseStrategy | null
  buying_model: CaseBuyingModel | null
  organisation: CaseOrganisation | null
}
export type CaseDimensionsPatch = {
  strategy?: CaseStrategy | null
  buying_model?: CaseBuyingModel | null
  organisation?: CaseOrganisation | null
}

export const projectQueryKeys = {
  caseDimensions: (id: string) => ['opportunities', 'case-dimensions', id] as const,
  all: ['projects'] as const,
  /** #4137 — la racine du kanban (`list`), de la fiche (`byId`) et de `similar` : HORS de `all`. */
  opportunities: ['opportunities'] as const,
  list: (userId?: string) => ['opportunities', 'list', userId] as const,
  // #4137 — sous `['projects']` : `useArchiveOpportunity` invalide `all`, donc un dossier
  // désarchivé sort de cette liste sans rien ajouter à la mutation.
  archived: (userId?: string) => ['projects', 'archived', userId] as const,
  /**
   * #2801 — l'IDENTITÉ entre dans la clé, comme `missionKeys.list({ id })` :
   * sans elle, la réponse à UN projet et la liste entière partageraient une
   * entrée, et le premier écran ouvert déciderait de ce que le second affiche.
   */
  byId: (userId: string | undefined, id: string) => ['opportunities', 'byId', userId, id] as const,
  similar: (id: string) => ['opportunities', 'similar', id] as const,
  lossReasons: ['projects', 'loss-reasons'] as const,
  /** #2171.22 — les étapes cochables, propres à CETTE opportunité. */
  steps: (id: string) => ['opportunities', 'steps', id] as const,
  /** #2171.24 — les documents suivis au niveau de l'affaire. */
  documents: (id: string) => ['opportunities', 'documents', id] as const,
  /**
   * ⚠️ La PORTÉE entre dans la clé, au même titre que la langue — même raison
   * que `missionKeys.revenue` (`features/missions/api.ts`) : le cockpit demande
   * le pipe du lecteur, `/projects` celui de l'espace. Sans la portée dans la
   * clé, les deux écrans partagent une entrée et le premier ouvert décide de ce
   * que le second affiche.
   */
  pipeline: (language: 'fr' | 'en', scope?: PipelineScopeRequest) =>
    ['projects', 'pipeline', language, scope ?? 'workspace'] as const,
}
