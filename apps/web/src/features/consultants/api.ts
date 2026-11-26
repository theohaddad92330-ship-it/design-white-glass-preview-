import type {
  Consultant,
  LinkedinLookupResponse,
  ConsultantArchiveBulkResult,
  ConsultantErasureResult,
  ConsultantCsvImportReport,
  CvBatchFileOutcome,
  CvBatchImportJobState,
  CvBatchImportReport,
  CvCommitInput,
  CvDetection,
  CvFilesImportInput,
  CvIntakeInput,
  CvMailImportInput,
  CvVersion,
  CvVersionDiff,
  CvZipImportInput,
  CvZipImportJobProgress,
  CvZipImportJobStatus,
  CvZipLargeImportStart,
  CvZipLargeUploadTicket,
  CvZipLargeUploadTicketRequest,
  CvZipManifest,
  GenerateCvVersionInput,
  MailAttachment,
  PoolSegmentCount,
  TalentPoolSegment,
  ParsedField,
  RecordFieldAudit,
  TalentDuplicateMatch,
  TalentIdentityState,
  TalentPage,
  TalentRow,
  TalentSearchQuery,
  MissingExpertiseReport,
  TalentStats,
  ConsultantBrief,
  InterviewBrief,
  BulkCvRewriteItemResult,
  ConsultantCvRewrite,
  ConsultantMatch,
  ConsultantPushFeedback,
  ConsultantUpsert,
  CvRewriteRequest,
  ProjectRow,
  MarketVerificationPlan,
  MarketVerificationPlanRequest,
  MarketVerificationRecordRequest,
  MarketVerificationStateRow,
  RecordConsultantFieldReportInput,
  RecordPushFeedback,
  RecordTalentInterviewTraitInput,
  RecordTalentRampUpInput,
  ReverseMarket,
  AvailabilityImportReport,
  AtsExportReport,
  SearchPeopleByNameResult,
  RecordImportMark,
} from '@bellum/contracts'
import * as tus from 'tus-js-client'
import { i18n } from '@/i18n'
// `ApiError` vient d'ici (et non de `@/lib/api-error`) pour que ce soit LA
// même classe que celle levée par `apiFetch` — même raison que
// `features/contacts/api.ts` (`pollEnrichment`).
import { ApiError, apiFetch } from '@/lib/api'

/**
 * #2570 — ce que rend `POST /consultants/:id/enrich`. `written` liste
 * uniquement les champs RÉELLEMENT écrits (une correction humaine peut tout
 * bloquer, auquel cas la liste est vide — un succès sans rien de changé).
 */
export type TalentEnrichmentResult = {
  consultant: Consultant
  // La provenance d'un CHAMP ÉCRIT — toujours `pipeline` ici (la cascade
  // fournisseur), même en démonstration : `consultant.last_enrichment_source`
  // ('pipeline' | 'demo') porte la distinction démo, séparément.
  written: { field: string; value: string; source: 'pipeline' }[]
}

/** Ce que rend `POST /talents/intake` : une fiche, ou une question. */
export type CvIntakeResult =
  | { outcome: 'duplicates'; duplicates: TalentDuplicateMatch[]; state?: TalentIdentityState }
  | { outcome: 'created'; consultantId: string; extractedChars: number; state?: 'new' }
  // #2327.17 — le CV a rejoint une fiche existante comme une version de plus.
  | { outcome: 'updated'; consultantId: string; extractedChars: number; state?: 'updated' }

/** Ce que l'écran de revue reçoit (§4.2). */
export type CvParseProposal = {
  fields: ParsedField[]
  sourceChars: number
  cvText: string
  canAcceptAll: boolean
  /** #2542.3 — la LECTURE du CV source était partielle (page sans calque
   *  texte) : un champ « non trouvé » ici n'est pas confirmé absent du CV. */
  partial: boolean
  /** #2184.37 / #2184.38 — pour chaque détection déjà revue au moins une fois,
   *  qui et quand. Une détection absente de cette carte n'a jamais été revue —
   *  ce n'est pas un « auteur inconnu » (GA-18/GA-19). */
  fieldHistory: Partial<Record<CvDetection, RecordFieldAudit>>
}

/** Ce que la validation a réellement écrit. */
export type CvCommitOutcome = {
  applied: { detection: CvDetection; provenance: 'human' | 'model' }[]
  rejected: CvDetection[]
  qualified: boolean
}

/**
 * #1952.6 (épopée #2844, lot SRC5 28/09 soir) — l'état d'UN job d'export en
 * lot, tel que le sert `bulk-export.service.ts` (`BulkExportJobView`, pas
 * exporté par le contrat partagé — ce type EST le contrat de cette route).
 */
export type BulkExportJobView = {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  total: number | null
  processed: number
  rowCount: number | null
  truncated: boolean
  error: string | null
}

/**
 * #1952.5 (épopée #2844, 30/09/2026) — l'état d'UN job de réécriture de CV en
 * lot, tel que le sert `bulk-cv-rewrite.service.ts` (`BulkCvRewriteJobView`,
 * pas exporté par le contrat partagé — même raison que {@link BulkExportJobView}
 * ci-dessus : ce type EST le contrat de cette route).
 */
export type BulkCvRewriteJobView = {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  total: number
  processed: number
  results: BulkCvRewriteItemResult[]
  error: string | null
}

/** Une ligne du pool : le strict nécessaire pour décider d'agir. */
type PoolEntry = { id: string; fullName: string; title: string | null; because: string }

/** Une mission d'un talent — ce que rend `GET /consultants/:id/missions`. */
type TalentMission = {
  missionId: string
  label: string | null
  accountName: string | null
  status: string | null
  startsOn: string | null
  endsOn: string | null
  loadPercent: number
}

/** Un changement de taux journalisé (§8.1). */
type TalentRateChange = {
  field: string
  oldValue: string | null
  newValue: string | null
  changedAt: string
}

/** Ce que l'aperçu de suppression rend — miroir de `talent-deletion-preview.ts`. */
type TalentDeletionPreview = {
  deleted: { key: string; count: number }[]
  orphaned: { key: string; count: number }[]
  kept: string[]
  blocking: string[]
}

/**
 * Client HTTP du vivier de consultants (`/consultants`) — annexe méthodo p22.
 * Auth via les cookies user-scopés que `apiFetch` transmet déjà.
 */
export const consultantsApi = {
  /** #4051 — « Importé le <date> depuis <source> » sur la fiche ; `null` = jamais importée. */
  importMark(id: string): Promise<{ importedFrom: RecordImportMark | null }> {
    return apiFetch<{ importedFrom: RecordImportMark | null }>({ path: `/consultants/${id}/import-mark` })
  },
  list(): Promise<Consultant[]> {
    return apiFetch<Consultant[]>({ path: '/consultants' })
  },
  /**
   * La recherche PAGINÉE du vivier — ce que l'écran utilise.
   *
   * Elle existait depuis la tranche T5 avec ses sept filtres et sa pagination,
   * et aucun code web ne l'appelait : l'écran chargeait tout le vivier d'un
   * coup. Elle porte en plus la disponibilité DÉRIVÉE des affectations, seule
   * réponse honnête pour un salarié.
   */
  search(query: Partial<TalentSearchQuery>): Promise<TalentPage> {
    const params = new URLSearchParams()
    if (query.q) params.set('q', query.q)
    if (query.kind) params.set('kind', query.kind)
    if (query.availability) params.set('availability', query.availability)
    if (query.seniority) params.set('seniority', query.seniority)
    if (query.maxTjm !== undefined) params.set('maxTjm', String(query.maxTjm))
    if (query.minTjm !== undefined) params.set('minTjm', String(query.minTjm))
    if (query.zone) params.set('zone', query.zone)
    if (query.sector) params.set('sector', query.sector)
    if (query.language) params.set('language', query.language)
    if (query.remotePreference) params.set('remotePreference', query.remotePreference)
    if (query.cvAvailable) params.set('cvAvailable', 'true')
    if (query.onMission) params.set('onMission', query.onMission)
    if (query.engagementKind) params.set('engagementKind', query.engagementKind)
    if (query.derived) params.set('derived', query.derived)
    if (query.freeBefore) params.set('freeBefore', query.freeBefore)
    if (query.neverSubmitted) params.set('neverSubmitted', 'true')
    if (query.dormantMonths !== undefined) params.set('dormantMonths', String(query.dormantMonths))
    if (query.excludeSeenByAccount) params.set('excludeSeenByAccount', query.excludeSeenByAccount)
    // #3488 — transmis SEULEMENT quand vrai : le contrat coerce la chaîne « false » en true.
    if (query.includeArchived) params.set('includeArchived', 'true')
    if (query.reviewStatus) params.set('reviewStatus', query.reviewStatus)
    if (query.radiusKm !== undefined) params.set('radiusKm', String(query.radiusKm))
    if (query.minYearsExperience !== undefined) params.set('minYearsExperience', String(query.minYearsExperience))
    if (query.noMissionMonths !== undefined) params.set('noMissionMonths', String(query.noMissionMonths))
    if (query.consentState) params.set('consentState', query.consentState)
    if (query.provenSkillsOnly) params.set('provenSkillsOnly', 'true')
    if (query.completeness) params.set('completeness', query.completeness)
    // Théo C talents-vivier.A12 — « Mes favoris ».
    if (query.favorite) params.set('favorite', query.favorite)
    for (const skill of query.skills ?? []) params.append('skills', skill)
    params.set('page', String(query.page ?? 1))
    params.set('limit', String(query.limit ?? 25))
    return apiFetch<TalentPage>({ path: `/talents?${params.toString()}` })
  },
  /** Théo C talents-vivier.A12 — poser ou retirer MON favori (personnel, idempotent). */
  setFavorite(id: string, isFavorite: boolean): Promise<{ id: string; is_favorite: boolean }> {
    return apiFetch<{ id: string; is_favorite: boolean }>({
      path: `/talents/${id}/favorite`,
      method: isFavorite ? 'POST' : 'DELETE',
    })
  },
  /** Le bandeau de statistiques du vivier (écran Vivier, PDF-22 §01). */
  stats(): Promise<TalentStats> {
    return apiFetch<TalentStats>({ path: '/talents/stats' })
  },
  /**
   * LES COMPÉTENCES QUI COÛTENT DES BESOINS (PDF 4 §8.4).
   *
   * `windowDays` vient du serveur et n'est pas redéclaré côté web : le seuil
   * vit à un seul endroit (GA-26), et l'écran l'ANNONCE plutôt que de le
   * supposer à quatre-vingt-dix.
   */
  missingExpertise(): Promise<{ windowDays: number; items: MissingExpertiseReport[] }> {
    return apiFetch<{ windowDays: number; items: MissingExpertiseReport[] }>({
      path: '/talents/missing-expertise',
    })
  },
  /** Une fiche complète — la liste paginée ne porte que ce qu'une ligne montre. */
  get(id: string): Promise<Consultant> {
    return apiFetch<Consultant>({ path: `/consultants/${id}` })
  },
  /**
   * La LIGNE DE VIVIER d'un talent — ce que l'entête de sa fiche affiche.
   *
   * `get()` rend la ligne SQL projetée : `availability`, le champ SAISI. La
   * disponibilité DÉRIVÉE des affectations, le nombre de compétences typées et
   * la présence d'un CV n'y sont pas — or ce sont exactement le badge du §6.2 et
   * les cinq axes de complétude. Une seconde dérivation côté web divergerait de
   * celle du serveur ; celle-ci est la MÊME.
   */
  summary(id: string): Promise<TalentRow> {
    return apiFetch<TalentRow>({ path: `/talents/${id}/summary` })
  },
  /** Dépose un CV et crée la fiche — ou rend les doublons, sans rien écrire. */
  intake(input: CvIntakeInput): Promise<CvIntakeResult> {
    return apiFetch<CvIntakeResult, CvIntakeInput>({ path: '/talents/intake', method: 'POST', body: input })
  },
  /**
   * #2569.1 — une archive ZIP entière : décision AUTOMATIQUE fichier par
   * fichier (créer / rejoindre une fiche fiable / isoler une exception).
   * Aucune pause sur un doublon — voir l'en-tête de `cv-batch-import.ts`.
   */
  intakeZip(input: CvZipImportInput): Promise<CvBatchImportReport> {
    return apiFetch<CvBatchImportReport, CvZipImportInput>({
      path: '/talents/intake/zip',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2431.6 (épopée #2883) — le manifeste (nombre de fichiers, doublons dans
   * le lot) lu AVANT `intakeZip`, sans rien écrire.
   */
  intakeZipManifest(input: CvZipImportInput): Promise<CvZipManifest> {
    return apiFetch<CvZipManifest, CvZipImportInput>({
      path: '/talents/intake/zip/manifest',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #3065 (lot 2b) — au-delà de `CV_ZIP_MAX_ARCHIVE_BYTES`, demande une URL
   * d'upload DIRECT vers le stockage : rien de ce qui suit n'envoie l'archive
   * à l'API.
   */
  intakeZipLargeUploadUrl(input: CvZipLargeUploadTicketRequest): Promise<CvZipLargeUploadTicket> {
    return apiFetch<CvZipLargeUploadTicket, CvZipLargeUploadTicketRequest>({
      path: '/talents/intake/zip/large-upload-url',
      method: 'POST',
      body: input,
    })
  },
  /** #3065 (lot 2b) — une fois l'upload direct terminé, démarre le job de traitement en streaming. */
  intakeZipLargeStart(input: CvZipLargeImportStart): Promise<{ job_id: string; state: 'queued' | 'running' }> {
    return apiFetch<{ job_id: string; state: 'queued' | 'running' }, CvZipLargeImportStart>({
      path: '/talents/intake/zip/large',
      method: 'POST',
      body: input,
    })
  },
  /** #3065 (lot 2b) — le suivi : progression, puis le même rapport que l'import en ligne. */
  intakeZipLargeStatus(jobId: string): Promise<CvZipImportJobStatus> {
    return apiFetch<CvZipImportJobStatus>({ path: `/talents/intake/zip/large/${encodeURIComponent(jobId)}` })
  },
  /**
   * #2326.6 (épopée #2794) — un DOSSIER entier de CV, même décision
   * automatique que `intakeZip`, sans passer par une archive ZIP.
   */
  intakeFiles(input: CvFilesImportInput): Promise<CvBatchImportReport> {
    return apiFetch<CvBatchImportReport, CvFilesImportInput>({
      path: '/talents/intake/files',
      method: 'POST',
      body: input,
    })
  },
  /** #2326.6 — le manifeste d'un dossier, lu AVANT `intakeFiles`, sans rien écrire. */
  intakeFilesManifest(input: CvFilesImportInput): Promise<CvZipManifest> {
    return apiFetch<CvZipManifest, CvFilesImportInput>({
      path: '/talents/intake/files/manifest',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2326.12 (épopée #2794) — L'ORCHESTRATEUR ASYNCHRONE : dépose le job et
   * rend la main tout de suite, au lieu d'attendre le lot entier comme
   * `intakeZip` ci-dessus.
   */
  intakeZipJob(input: CvZipImportInput): Promise<{ jobId: string; total: number }> {
    return apiFetch<{ jobId: string; total: number }, CvZipImportInput>({
      path: '/talents/intake/zip/jobs',
      method: 'POST',
      body: input,
    })
  },
  /** #2326.12 — même orchestrateur, pour un DOSSIER (#2326.6). */
  intakeFilesJob(input: CvFilesImportInput): Promise<{ jobId: string; total: number }> {
    return apiFetch<{ jobId: string; total: number }, CvFilesImportInput>({
      path: '/talents/intake/files/jobs',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2326.24/.27 — l'état d'un job : progression en vol, puis rapport final.
   * Interrogeable depuis n'importe quelle connexion, y compris après un
   * rechargement de page — le job n'appartient pas à la requête qui l'a lancé.
   */
  intakeJobState(jobId: string): Promise<CvBatchImportJobState> {
    return apiFetch<CvBatchImportJobState>({ path: `/talents/intake/jobs/${jobId}` })
  },
  /**
   * #2568.1 — une pièce jointe d'un fil DÉJÀ AUTORISÉ (listée par
   * `mailAttachments`) devient une fiche du vivier. Ne lit jamais le corps du
   * message : seule la pièce jointe traverse ce chemin (D65).
   */
  intakeMail(input: CvMailImportInput): Promise<CvBatchFileOutcome> {
    return apiFetch<CvBatchFileOutcome, CvMailImportInput>({
      path: '/talents/intake/mail',
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2183.5 — un lot de consultants depuis un fichier CSV. Même discipline
   * que l'import ZIP : une ressemblance ARRÊTE la ligne, jamais de fusion.
   */
  importCsv(content: string): Promise<ConsultantCsvImportReport> {
    return apiFetch<ConsultantCsvImportReport, { content: string }>({
      path: '/talents/import-csv',
      method: 'POST',
      body: { content },
    })
  },
  /**
   * #2326.7/.9 (épopée #2794) — tableau de disponibilités (nom/e-mail + date
   * + taux). Met à jour les fiches EXISTANTES, ne crée jamais un talent.
   * `content` est le texte du CSV, ou le fichier XLSX encodé en base64.
   */
  importAvailability(format: 'csv' | 'xlsx', content: string): Promise<AvailabilityImportReport> {
    return apiFetch<AvailabilityImportReport, { format: 'csv' | 'xlsx'; content: string }>({
      path: '/talents/import-availability',
      method: 'POST',
      body: { format, content },
    })
  },
  /** #2326.8 (épopée #2794) — le vivier ENTIER (hors archivés), colonnes ATS. */
  exportAts(): Promise<AtsExportReport> {
    return apiFetch<AtsExportReport>({ path: '/talents/export/ats' })
  },
  /**
   * #1952.6 (épopée #2844) — l'export ATS plafonné (`exportAts`, ci-dessus)
   * n'a JAMAIS eu d'appelant pour sa version en lot : le service et la route
   * (`BulkExportController`, `talents/export/bulk`) existaient, testés,
   * jamais atteints depuis l'écran (#1952.6 « reste » sur l'épopée, plusieurs
   * lots). Un job en tâche de fond, sans le plafond `ATS_EXPORT_MAX_ROWS`.
   */
  enqueueBulkExport(): Promise<BulkExportJobView> {
    return apiFetch<BulkExportJobView>({ path: '/talents/export/bulk', method: 'POST' })
  },
  bulkExportJobState(jobId: string): Promise<BulkExportJobView> {
    return apiFetch<BulkExportJobView>({ path: `/talents/export/bulk/${jobId}` })
  },
  /**
   * #1952.5 (épopée #2844, 30/09/2026) — la réécriture de CV en LOT : le
   * moteur (`bulk-cv-rewrite.{queue,service,worker,gateway}.ts`,
   * `POST consultants/cv-rewrite/bulk`) était livré et testé depuis le lot
   * SRC5/S06 (28-29/09) sans AUCUN appelant web — même trou que
   * {@link enqueueBulkExport} avant #1952.6.
   */
  enqueueBulkCvRewrite(opportunityId: string, consultantIds: readonly string[]): Promise<BulkCvRewriteJobView> {
    return apiFetch<BulkCvRewriteJobView>({
      path: '/consultants/cv-rewrite/bulk',
      method: 'POST',
      body: { opportunity_id: opportunityId, consultant_ids: consultantIds },
    })
  },
  bulkCvRewriteJobState(jobId: string): Promise<BulkCvRewriteJobView> {
    return apiFetch<BulkCvRewriteJobView>({ path: `/consultants/cv-rewrite/bulk/${jobId}` })
  },
  /**
   * Les pièces jointes d'UN message déjà lisible par la messagerie connectée
   * (`GET /mailbox/attachments`, route testée côté serveur, sans appelant web
   * avant ce lot). Jamais téléchargées à cet instant — seul l'identifiant sert
   * à préparer #2568.1.
   */
  mailAttachments(messageId: string): Promise<MailAttachment[]> {
    return apiFetch<MailAttachment[]>({ path: `/mailbox/attachments?messageId=${encodeURIComponent(messageId)}` })
  },
  /** Lit le CV et PROPOSE treize blocs. N'écrit rien (§4). */
  parseCv(id: string): Promise<CvParseProposal> {
    return apiFetch<CvParseProposal, Record<string, never>>({
      path: `/consultants/${id}/parse`,
      method: 'POST',
      body: {},
    })
  },
  /** Écrit ce qu'un humain a validé, et qualifie la fiche (§4.2). */
  commitCvParse(id: string, input: CvCommitInput): Promise<CvCommitOutcome> {
    return apiFetch<CvCommitOutcome, CvCommitInput>({
      path: `/consultants/${id}/parse/commit`,
      method: 'POST',
      body: input,
    })
  },
  /** Les versions déjà générées, la plus récente d'abord (§9.2). */
  cvVersions(id: string): Promise<{ items: CvVersion[] }> {
    return apiFetch<{ items: CvVersion[] }>({ path: `/consultants/${id}/cv-versions` })
  },
  /** Compose une version et l'enregistre — aucune n'écrase la précédente. */
  generateCvVersion(id: string, input: GenerateCvVersionInput): Promise<CvVersion> {
    return apiFetch<CvVersion, GenerateCvVersionInput>({
      path: `/consultants/${id}/cv-versions`,
      method: 'POST',
      body: input,
    })
  },
  /** Le geste humain de validation (#2333.8/.9), quand la policy d'espace en
   *  demande un distinct de la génération. */
  validateCvVersion(id: string, versionId: string): Promise<CvVersion> {
    return apiFetch<CvVersion>({
      path: `/consultants/${id}/cv-versions/${versionId}/validate`,
      method: 'POST',
    })
  },
  /** L'action « Comparer » (#2187.42) — le diff entre deux versions. */
  compareCvVersions(id: string, versionAId: string, versionBId: string): Promise<CvVersionDiff> {
    return apiFetch<CvVersionDiff>({
      path: `/consultants/${id}/cv-versions/compare?a=${encodeURIComponent(versionAId)}&b=${encodeURIComponent(versionBId)}`,
    })
  },
  /** L'action « Modifier » (#2187.42) — réservée à une version pas encore validée. */
  updateCvVersionSections(
    id: string,
    versionId: string,
    sections: { title: string; body: string }[],
  ): Promise<CvVersion> {
    return apiFetch<CvVersion, { sections: { title: string; body: string }[] }>({
      path: `/consultants/${id}/cv-versions/${versionId}`,
      method: 'PATCH',
      body: { sections },
    })
  },
  /** Les effectifs du pool de réactivation (§11). */
  poolCounts(): Promise<{ items: PoolSegmentCount[] }> {
    return apiFetch<{ items: PoolSegmentCount[] }>({ path: '/talents/pool' })
  },
  /** Le contenu d'un segment, avec la RAISON de chaque présence. */
  poolSegment(segment: TalentPoolSegment): Promise<{ items: PoolEntry[] }> {
    return apiFetch<{ items: PoolEntry[] }>({ path: `/talents/pool/${segment}` })
  },
  /** Les missions d'un talent (onglet 7). */
  missions(id: string): Promise<{ items: TalentMission[] }> {
    return apiFetch<{ items: TalentMission[] }>({ path: `/consultants/${id}/missions` })
  },
  /** L'historique horodaté des taux (§8.1), sous `finance:read`. */
  rateHistory(id: string): Promise<{ items: TalentRateChange[] }> {
    return apiFetch<{ items: TalentRateChange[] }>({ path: `/consultants/${id}/rate-history` })
  },
  archive(id: string, reason: string | null): Promise<Consultant> {
    return apiFetch<Consultant, { reason: string | null }>({
      path: `/consultants/${id}/archive`,
      method: 'POST',
      body: { reason },
    })
  },
  /** #2662.2 — archive une SÉLECTION en un geste (« nettoyer mon vivier »).
   *  Jamais une suppression : même route qu'`archive`, appliquée en lot. */
  archiveBulk(ids: readonly string[], reason: string | null): Promise<ConsultantArchiveBulkResult> {
    return apiFetch<ConsultantArchiveBulkResult, { consultant_ids: readonly string[]; reason: string | null }>({
      path: '/consultants/archive/bulk',
      method: 'POST',
      body: { consultant_ids: ids, reason },
    })
  },
  /** #3781 — « supprimer définitivement » : l'EFFACEMENT RGPD de personnes du
   *  vivier (doctrine c67). IRRÉVERSIBLE ; `confirm: true` n'est envoyé qu'après
   *  la confirmation explicite de l'écran (`TalentEraseDialog`). */
  eraseBulk(ids: readonly string[]): Promise<ConsultantErasureResult> {
    return apiFetch<ConsultantErasureResult, { consultant_ids: readonly string[]; confirm: true }>({
      path: '/consultants/erase/bulk',
      method: 'POST',
      body: { consultant_ids: ids, confirm: true },
    })
  },
  reactivate(id: string): Promise<Consultant> {
    return apiFetch<Consultant, Record<string, never>>({
      path: `/consultants/${id}/reactivate`,
      method: 'POST',
      body: {},
    })
  },
  /** #2185.48 — « Valider disponibilité » : revalide la disponibilité DÉCLARÉE
   *  sans en changer la valeur. */
  confirmAvailability(id: string): Promise<Consultant> {
    return apiFetch<Consultant, Record<string, never>>({
      path: `/consultants/${id}/availability/confirm`,
      method: 'POST',
      body: {},
    })
  },
  /** #2948 (#2329.47) — « TJM validé », un axe de l'accord à 7 conditions. */
  confirmTjmValidated(id: string): Promise<Consultant> {
    return apiFetch<Consultant, Record<string, never>>({
      path: `/consultants/${id}/positioning/confirm-tjm`,
      method: 'POST',
      body: {},
    })
  },
  /** #2948 (#2329.51) — « CV validé ou règles d'usage acceptées ». */
  confirmCvValidated(id: string): Promise<Consultant> {
    return apiFetch<Consultant, Record<string, never>>({
      path: `/consultants/${id}/positioning/confirm-cv`,
      method: 'POST',
      body: {},
    })
  },
  /** BEL-SC-238 (#3267) — un trait observé en ENTRETIEN (communication,
   *  autonomie), jamais un CV. */
  recordInterviewTrait(id: string, input: RecordTalentInterviewTraitInput): Promise<Consultant> {
    return apiFetch<Consultant, RecordTalentInterviewTraitInput>({
      path: `/consultants/${id}/interview-traits`,
      method: 'POST',
      body: input,
    })
  },
  /** BEL-SC-238 (#3267) — le temps avant efficacité ANNONCÉ en entretien. */
  recordRampUp(id: string, input: RecordTalentRampUpInput): Promise<Consultant> {
    return apiFetch<Consultant, RecordTalentRampUpInput>({
      path: `/consultants/${id}/ramp-up`,
      method: 'POST',
      body: input,
    })
  },
  /** #3406 — capitalise une information TERRAIN remontée par ce consultant.
   *  APPEND-ONLY : aucune édition ni suppression, voir le service. */
  recordFieldReport(id: string, input: RecordConsultantFieldReportInput): Promise<Consultant> {
    return apiFetch<Consultant, RecordConsultantFieldReportInput>({
      path: `/consultants/${id}/field-reports`,
      method: 'POST',
      body: input,
    })
  },
  /** #2185.10 — « Suivi par » : désigne (ou retire, `null`) le référent
   *  commercial de la fiche. Route à part de l'édition générale, même patron
   *  que le manager client d'une mission (#2836). */
  setOwner(id: string, ownerUserId: string | null): Promise<Consultant> {
    return apiFetch<Consultant, { ownerUserId: string | null }>({
      path: `/consultants/${id}/owner`,
      method: 'PATCH',
      body: { ownerUserId },
    })
  },
  /** Ce qui partira si on supprime, AVANT de supprimer (PDF 3 §7.3). */
  deletionPreview(id: string): Promise<TalentDeletionPreview> {
    return apiFetch<TalentDeletionPreview>({ path: `/consultants/${id}/deletion-preview` })
  },
  create(input: ConsultantUpsert): Promise<Consultant> {
    return apiFetch<Consultant, ConsultantUpsert>({ path: '/consultants', method: 'POST', body: input })
  },
  update(id: string, input: ConsultantUpsert): Promise<Consultant> {
    return apiFetch<Consultant, ConsultantUpsert>({ path: `/consultants/${id}`, method: 'PUT', body: input })
  },
  /** Le matching du vivier contre un besoin : le classement complet + le TOP
   *  défendable (borné à 5, #2330.7) + la sélection poussable (1-2 profils, p22). */
  match(
    opportunityId: string,
  ): Promise<{ ranked: ConsultantMatch[]; top: ConsultantMatch[]; push: ConsultantMatch[] }> {
    return apiFetch<{ ranked: ConsultantMatch[]; top: ConsultantMatch[]; push: ConsultantMatch[] }>({
      path: `/consultants/match/${opportunityId}`,
    })
  },
  /**
   * Les besoins matérialisés du portefeuille — la source du sélecteur de besoin.
   *
   * La route s'appelle `/projects` depuis T1 : la TABLE est restée
   * `opportunities`, mais l'API, elle, a bien été renommée. Cet appel visait
   * encore l'ancien chemin et rendait 404 — le sélecteur de besoin du vivier
   * restait donc vide, ce qui se lisait « aucun besoin » et non « la requête
   * n'aboutit pas ».
   */
  listOpportunities(): Promise<ProjectRow[]> {
    return apiFetch<ProjectRow[]>({ path: '/projects' })
  },
  /** REX d'un push (annexe méthodo p22 : retenu / refusé / raison / apprentissage). */
  recordFeedback(consultantId: string, input: RecordPushFeedback): Promise<ConsultantPushFeedback> {
    return apiFetch<ConsultantPushFeedback, RecordPushFeedback>({
      path: `/consultants/${consultantId}/feedback`,
      method: 'POST',
      body: input,
    })
  },
  /** Le brief de soutenance d'un consultant sur un besoin (déterministe). */
  brief(consultantId: string, opportunityId: string): Promise<ConsultantBrief> {
    return apiFetch<ConsultantBrief>({ path: `/consultants/${consultantId}/brief/${opportunityId}` })
  },
  /** #2189.23-.30 (épopée #2940) — le brief D'ENTRETIEN, distinct du brief de soutenance. */
  interviewBrief(consultantId: string, opportunityId: string): Promise<InterviewBrief> {
    return apiFetch<InterviewBrief>({ path: `/consultants/${consultantId}/interview-brief/${opportunityId}` })
  },
  /** Réécrit le CV du consultant pour ce besoin (annexe méthodo p22). Écrit :
   *  le résultat remplace le CV courant du couple (consultant, besoin). */
  rewriteCv(consultantId: string, opportunityId: string): Promise<ConsultantCvRewrite> {
    return apiFetch<ConsultantCvRewrite, CvRewriteRequest>({
      path: `/consultants/${consultantId}/cv-rewrite`,
      method: 'POST',
      body: { opportunity_id: opportunityId },
    })
  },
  /**
   * La prospection inversée VERS LE MARCHÉ (§6.2, BEL-ATS-010) : un `GET`, pas
   * un `POST` — une lecture de relevés déjà collectés, sans crédit ni appel
   * sortant ni écriture, jamais un classement de personnes qui journaliserait.
   */
  reverseMarket(consultantId: string): Promise<ReverseMarket> {
    return apiFetch<ReverseMarket>({ path: `/consultants/${consultantId}/reverse-market` })
  },
  /**
   * #2570 — même enrichissement qu'un contact (coordonnées, poste actuel),
   * réutilisant la même cascade fournisseur, sur GESTE explicite (1 crédit).
   *
   * #3831.1 — `apolloId` : l'homonyme CHOISI après `searchByName` ci-dessous,
   * la seule clé disponible quand la fiche n'a pas de profil LinkedIn.
   */
  enrich(consultantId: string, apolloId?: string): Promise<TalentEnrichmentResult> {
    return apiFetch<TalentEnrichmentResult, { apolloId?: string }>({
      path: `/consultants/${consultantId}/enrich`,
      method: 'POST',
      body: { apolloId },
    })
  },
  /**
   * H-DECISIONS #4348 — l'URL d'un profil LinkedIn pré-remplit une fiche à créer.
   * N'écrit rien ; 1 crédit par succès, 0 résultat = 0 débit (règle d'enrichissement).
   */
  linkedinLookup(url: string): Promise<LinkedinLookupResponse> {
    return apiFetch<LinkedinLookupResponse, { url: string }>({
      path: '/consultants/linkedin-lookup',
      method: 'POST',
      body: { url },
    })
  },
  /**
   * #3831.1 — « je tape un nom, je vois les homonymes, je choisis » (retour
   * bêta 07/10/2026) : enrichir SANS profil LinkedIn connu, sans jamais
   * deviner sur le seul nom. Même capacité que `contactsApi.searchByName`
   * (#2727) — recherche GRATUITE, aucun crédit débité ici.
   */
  searchByName(fullName: string, organizationName?: string): Promise<SearchPeopleByNameResult> {
    const params = new URLSearchParams({ fullName })
    if (organizationName?.trim()) params.set('organizationName', organizationName.trim())
    return apiFetch<SearchPeopleByNameResult>({ path: `/consultants/search-by-name?${params.toString()}` })
  },
  /**
   * #2288.4 — LE COÛT ANNONCÉ AVANT la vérification payante. `POST` parce que
   * le périmètre est une LISTE de libellés, pas parce qu'il écrit : cette route
   * ne débite rien, n'appelle personne et n'écrit rien.
   */
  marketVerificationPlan(consultantId: string, companies: readonly string[]): Promise<MarketVerificationPlan> {
    return apiFetch<MarketVerificationPlan, MarketVerificationPlanRequest>({
      path: `/consultants/${consultantId}/market-verification/plan`,
      method: 'POST',
      body: { companies: [...companies] },
    })
  },
  /**
   * #2288.2 (décision Louis, 18/09/2026) — les ÉTATS de vérification, lisibles
   * par tout membre : `GET`, aucun montant, aucun crédit. Chaque libellé est un
   * paramètre RÉPÉTÉ, encodé par `URLSearchParams` — un « & » dans un nom
   * d'entreprise couperait sinon la requête.
   */
  marketVerificationStates(
    consultantId: string,
    companies: readonly string[],
  ): Promise<{ states: MarketVerificationStateRow[] }> {
    const params = new URLSearchParams()
    for (const company of companies) params.append('companies', company)
    return apiFetch<{ states: MarketVerificationStateRow[] }>({
      path: `/consultants/${consultantId}/market-verification/states?${params.toString()}`,
    })
  },
  /**
   * #2288.2 — la CONSERVATION : inscrire qu'une vérification a été lancée, pour
   * ne pas la repayer. Le coût est décidé par le serveur, jamais envoyé d'ici.
   */
  recordMarketVerification(
    consultantId: string,
    body: MarketVerificationRecordRequest,
  ): Promise<{ keptHumanCorrection: boolean }> {
    return apiFetch<{ keptHumanCorrection: boolean }, MarketVerificationRecordRequest>({
      path: `/consultants/${consultantId}/market-verification/receipts`,
      method: 'POST',
      body,
    })
  },
  /**
   * #2968 — les entreprises MASQUÉES par l'appelant sur ce consultant. `GET`,
   * lisible par tout membre : un geste personnel et gratuit, sans montant.
   */
  reverseMarketDismissedCompanies(consultantId: string): Promise<{ companies: string[] }> {
    return apiFetch<{ companies: string[] }>({
      path: `/consultants/${consultantId}/reverse-market/dismissals`,
    })
  },
  /**
   * #2968 — MASQUE une entreprise d'« Environnements compatibles », pour
   * l'appelant sur ce consultant. Persistant et par personne.
   */
  dismissReverseMarketCompany(consultantId: string, companyName: string): Promise<{ dismissed: true }> {
    return apiFetch<{ dismissed: true }, { companyName: string }>({
      path: `/consultants/${consultantId}/reverse-market/dismissals`,
      method: 'POST',
      body: { companyName },
    })
  },
  /**
   * #2968 — DÉMASQUE une entreprise déjà masquée par l'appelant. La ligne
   * n'est jamais supprimée côté serveur (doctrine « on archive, on ne
   * supprime pas ») : cette route bascule `dismissed_at`, elle ne détruit rien.
   */
  restoreReverseMarketCompany(consultantId: string, companyName: string): Promise<{ dismissed: false }> {
    return apiFetch<{ dismissed: false }, { companyName: string }>({
      path: `/consultants/${consultantId}/reverse-market/dismissals`,
      method: 'DELETE',
      body: { companyName },
    })
  },
}

/**
 * #3065 (lot 2b) — ce que l'écran apprend pendant un import ZIP volumineux.
 * Trois PHASES, jamais confondues : l'envoi (le navigateur écrit lui-même
 * dans le stockage — `percent` vient de l'upload, pas du traitement),
 * l'attente (le job n'a pas encore démarré), le traitement (le worker lit
 * l'archive en streaming — `progress` vient de LÀ).
 *
 * #3303 — une QUATRIÈME phase, `retrying` : une coupure réseau pendant
 * l'envoi n'est jamais un échec, `tus-js-client` reprend seul depuis le
 * dernier morceau reçu — mais l'écran le DIT plutôt que de laisser la barre
 * de progression immobile sans explication.
 */
export type CvZipLargeImportProgressEvent =
  | { phase: 'uploading'; percent: number }
  | { phase: 'retrying'; attempt: number }
  | { phase: 'queued' }
  | { phase: 'running'; progress: CvZipImportJobProgress | null }

/** 6 Mo — la taille de morceau que documente Supabase Storage pour un dépôt
 *  TUS (« it must be set to 6MB (for now) do not change it »). */
const CV_ZIP_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024

/** Paliers de reprise après coupure réseau — mêmes valeurs que la doc TUS de
 *  Supabase Storage : plusieurs tentatives espacées, jamais un seul essai. */
const CV_ZIP_TUS_RETRY_DELAYS_MS = [0, 3_000, 5_000, 10_000, 20_000]

/** Le code HTTP d'un vrai refus TUS, quand `tus-js-client` en porte un — sinon
 *  `0` (coupure réseau pure, aucune réponse reçue). */
function tusErrorStatus(error: Error): number {
  const detailed = error as { originalResponse?: { getStatus?: () => number } }
  return detailed.originalResponse?.getStatus?.() ?? 0
}

/**
 * #3303 — le message qui dit LEQUEL refus, jamais le générique : un 413
 * (trop lourd), un 415 (type refusé) ou un 403 (droit refusé) ne sont pas la
 * même panne pour qui regarde l'écran, et aucun des trois n'est une coupure
 * réseau que `tus-js-client` aurait déjà reprise seul.
 */
function cvZipUploadErrorMessage(status: number, cause = ''): string {
  if (status === 413) return i18n.t('consultants:batchImport.zip.large.uploadRefusedSize')
  if (status === 415) return i18n.t('consultants:batchImport.zip.large.uploadRefusedType')
  if (status === 403) return i18n.t('consultants:batchImport.zip.large.uploadRefusedForbidden')
  // Import ZIP 666 Mo (04/10/2026) — le générique cachait un 400 « Invalid
  // Compact JWS » : un refus porteur d'un corps dit SA cause.
  if (status > 0 && cause) return i18n.t('consultants:batchImport.zip.large.uploadRefusedWithCause', { status, cause })
  return i18n.t('consultants:batchImport.zip.large.uploadFailed')
}

/** Plafond de la cause recopiée à l'écran — un résumé, jamais une page HTML. */
const CV_ZIP_UPLOAD_CAUSE_MAX_CHARS = 200

/**
 * Le corps d'un refus du stockage, RÉSUMÉ : `message` (ou `error`) d'un corps
 * JSON, sinon le texte brut, sur une ligne, borné. Tout ce qui ressemble à un
 * jeton (JWT `eyJ…`) est masqué — le corps ne doit jamais recopier un secret.
 */
function tusErrorCause(error: Error): string {
  const detailed = error as { originalResponse?: { getBody?: () => string } }
  const body = detailed.originalResponse?.getBody?.() ?? ''
  if (!body) return ''
  let text = body
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown }
    const picked = typeof parsed.message === 'string' ? parsed.message : parsed.error
    if (typeof picked === 'string' && picked) text = picked
  } catch {
    // Corps non JSON : le texte brut, résumé ci-dessous.
  }
  const cleaned = text
    .replace(/eyJ[\w-]*\.[\w-]*\.[\w-]*/g, '[jeton]')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > CV_ZIP_UPLOAD_CAUSE_MAX_CHARS
    ? `${cleaned.slice(0, CV_ZIP_UPLOAD_CAUSE_MAX_CHARS)}…`
    : cleaned
}

/** Un refus qui ne changera pas en réessayant à l'identique. */
const CV_ZIP_TUS_FINAL_STATUSES = new Set([400, 401, 403, 413, 415])

/**
 * L'upload REPRIS PAR MORCEAUX vers le stockage (#3303, protocole TUS,
 * `tus-js-client`) — jamais via `apiFetch` : l'endpoint de reprise pointe une
 * origine différente de l'API, et le corps est l'archive elle-même, pas un
 * JSON. Remplace l'envoi en un seul `PUT` (#3065) : une archive de plusieurs
 * centaines de mégaoctets sur un réseau imparfait n'a plus besoin de repartir
 * de zéro à la moindre coupure — `tus-js-client` reprend seul depuis le
 * dernier morceau de {@link CV_ZIP_TUS_CHUNK_SIZE_BYTES} reçu.
 *
 * Authentifié par le jeton d'upload SIGNÉ du ticket (`x-signature`), limité à
 * CE chemin — jamais la clé service côté client (voir l'en-tête de
 * `CvZipLargeUploadTicket`, `@bellum/contracts`).
 *
 * `contentType` est TOUJOURS `application/zip`, jamais `file.type` : un
 * export Windows rend parfois `application/x-zip-compressed`, d'autres
 * navigateurs ne rendent rien du tout — cet écran sait déjà, par construction
 * (l'entrée qui l'a ouvert n'accepte que `.zip`), qu'il dépose une archive.
 */
export function uploadCvZipArchive(
  ticket: CvZipLargeUploadTicket,
  file: File,
  onProgress?: (event: CvZipLargeImportProgressEvent) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: ticket.resumableEndpoint,
      chunkSize: CV_ZIP_TUS_CHUNK_SIZE_BYTES,
      retryDelays: CV_ZIP_TUS_RETRY_DELAYS_MS,
      removeFingerprintOnSuccess: true,
      headers: { 'x-signature': ticket.token, 'x-upsert': 'true' },
      metadata: {
        bucketName: ticket.bucket,
        objectName: ticket.path,
        contentType: 'application/zip',
        cacheControl: '3600',
      },
      onShouldRetry: (error, retryAttempt, options) => {
        const status = tusErrorStatus(error)
        // Un vrai refus (413/415/403) ne se reprend jamais — le redire à
        // l'identique après cinq tentatives mentirait sur la cause.
        if (CV_ZIP_TUS_FINAL_STATUSES.has(status)) return false
        onProgress?.({ phase: 'retrying', attempt: retryAttempt + 1 })
        return retryAttempt < options.retryDelays!.length
      },
      onError: error =>
        reject(
          new ApiError(cvZipUploadErrorMessage(tusErrorStatus(error), tusErrorCause(error)), tusErrorStatus(error)),
        ),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesTotal > 0)
          onProgress?.({ phase: 'uploading', percent: Math.round((bytesUploaded / bytesTotal) * 100) })
      },
      onSuccess: () => resolve(),
    })
    upload
      .findPreviousUploads()
      .then(previousUploads => {
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0])
        upload.start()
      })
      .catch(error => reject(new ApiError(cvZipUploadErrorMessage(tusErrorStatus(error as Error)), 0)))
  })
}

/** Rythme du suivi — même raison que `pollEnrichment` (`features/contacts/api.ts`) :
 *  assez fin pour rester vivant, assez large pour qu'un lot de plusieurs
 *  minutes ne fasse pas des centaines de requêtes. */
const CV_ZIP_LARGE_POLL_INTERVAL_MS = 2_000
/** Import 688 CV (04/10/2026) — plus de plafond ABSOLU (35 min abandonnaient
 *  un lot qui avançait) : le suivi ne s'arrête que si le job reste IMMOBILE
 *  (ni état ni compteur ne bougent) pendant ce délai. */
const CV_ZIP_LARGE_POLL_STALL_MS = 15 * 60_000

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Suit le job jusqu'à son terme. `unknown` n'est pas « rien trouvé » — c'est
 * NOUS qui avons perdu la réponse (même raison que `pollEnrichment`) : le dire
 * autrement mentirait sur l'archive, qui continue peut-être son traitement.
 *
 * Tant que le job PROGRESSE, on continue à suivre ; seul un job immobile
 * pendant {@link CV_ZIP_LARGE_POLL_STALL_MS} rend la main (« il continue en
 * tâche de fond »).
 */
export async function pollCvZipLargeImport(
  jobId: string,
  onProgress?: (event: CvZipLargeImportProgressEvent) => void,
  timing: { intervalMs?: number; stallMs?: number } = {},
): Promise<CvBatchImportReport> {
  const intervalMs = timing.intervalMs ?? CV_ZIP_LARGE_POLL_INTERVAL_MS
  const stallMs = timing.stallMs ?? CV_ZIP_LARGE_POLL_STALL_MS
  let lastSignature = ''
  let deadline = Date.now() + stallMs
  for (;;) {
    const status = await consultantsApi.intakeZipLargeStatus(jobId)
    if (status.state === 'done') return status.result
    if (status.state === 'failed') throw new ApiError(status.reason, 500)
    if (status.state !== 'queued' && status.state !== 'running') {
      throw new ApiError(i18n.t('consultants:batchImport.zip.large.resultLost'), 404)
    }
    onProgress?.(status.state === 'running' ? { phase: 'running', progress: status.progress } : { phase: 'queued' })
    const signature = `${status.state}:${status.state === 'running' ? `${status.progress?.processed ?? -1}:${status.progress?.phase ?? ''}:${status.progress?.bytesDownloaded ?? ''}` : ''}`
    if (signature !== lastSignature) {
      lastSignature = signature
      deadline = Date.now() + stallMs
    } else if (Date.now() >= deadline) {
      throw new ApiError(i18n.t('consultants:batchImport.zip.large.stillRunning'), 504)
    }
    await wait(intervalMs)
  }
}

/**
 * #3065 (lot 2b) — LE PARCOURS COMPLET de l'import ZIP volumineux : le ticket
 * d'upload, le dépôt direct, le démarrage du traitement, puis son suivi
 * jusqu'au MÊME rapport que l'import en ligne (`intakeZip`) — jamais un
 * second format d'affichage selon la taille de l'archive.
 */
export async function importCvZipLarge(
  file: File,
  onProgress?: (event: CvZipLargeImportProgressEvent) => void,
): Promise<CvBatchImportReport> {
  const ticket = await consultantsApi.intakeZipLargeUploadUrl({ filename: file.name, byteSize: file.size })
  await uploadCvZipArchive(ticket, file, onProgress)
  const started = await consultantsApi.intakeZipLargeStart({ path: ticket.path, filename: file.name })
  onProgress?.(started.state === 'running' ? { phase: 'running', progress: null } : { phase: 'queued' })
  return pollCvZipLargeImport(started.job_id, onProgress)
}
