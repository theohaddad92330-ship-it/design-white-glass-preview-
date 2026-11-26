import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type {
  Consultant,
  ConsultantArchiveBulkResult,
  ConsultantErasureResult,
  ConsultantCsvImportReport,
  ConsultantUpsert,
  CvBatchFileOutcome,
  CvBatchImportJobState,
  CvBatchImportReport,
  CvCommitInput,
  CvFilesImportInput,
  CvIntakeInput,
  CvMailImportInput,
  CvVersion,
  CvVersionDiff,
  CvZipImportInput,
  CvZipManifest,
  GenerateCvVersionInput,
  MailAttachment,
  RecordConsultantFieldReportInput,
  RecordTalentInterviewTraitInput,
  RecordTalentRampUpInput,
  TalentPage,
  TalentPoolSegment,
  TalentRow,
  TalentSearchQuery,
  TalentStats,
  AvailabilityImportReport,
  AtsExportReport,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'
import { launchVerifications } from './lib/launchVerifications'
import {
  consultantsApi,
  importCvZipLarge,
  type BulkCvRewriteJobView,
  type BulkExportJobView,
  type CvCommitOutcome,
  type CvIntakeResult,
  type CvParseProposal,
  type CvZipLargeImportProgressEvent,
  type TalentEnrichmentResult,
} from './api'

// #2152.27 — `useConsultants` vit dans `use-consultants.ts` (voir ce fichier) ; ré-exporté ici.
export { useConsultants } from './use-consultants'

/**
 * La recherche paginée du vivier — la source de l'écran.
 *
 * `keepPreviousData` : changer de page ou taper une lettre ne doit pas vider la
 * liste sous les yeux. `staleTime` court parce qu'une affectation posée par un
 * collègue change la disponibilité affichée.
 */
export function useTalentSearch(query: Partial<TalentSearchQuery>, options: { enabled?: boolean } = {}) {
  const { user } = useSession()
  return useQuery<TalentPage>({
    queryKey: ['talents', 'search', user?.id, query],
    queryFn: () => consultantsApi.search(query),
    enabled: !!user && options.enabled !== false,
    staleTime: 15_000,
    placeholderData: (previous: TalentPage | undefined) => previous,
  })
}

/**
 * Le bandeau de statistiques du vivier (écran Vivier, PDF-22 §01).
 *
 * Compte sur TOUT l'espace, jamais sur la page ou le filtre courant — une
 * requête à part, indépendante de `useTalentSearch`, exactement comme
 * `HygieneBadge` lit son propre compte plutôt que de recompter la liste
 * affichée.
 */
export function useTalentStats() {
  const { user } = useSession()
  return useQuery<TalentStats>({
    queryKey: ['talents', 'stats', user?.id],
    queryFn: () => consultantsApi.stats(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/**
 * LES COMPÉTENCES SUR LESQUELLES TROIS BESOINS SONT PARTIS (PDF 4 §8.4).
 *
 * Le produit comptait déjà ces refus, par MOTIF (« compétence absente du
 * vivier » × 47). Cette lecture-ci les compte par COMPÉTENCE — la donnée
 * existait, l'axe d'agrégation manquait.
 */
export function useMissingExpertise() {
  const { user } = useSession()
  return useQuery({
    queryKey: ['talents', 'missing-expertise', user?.id],
    queryFn: () => consultantsApi.missingExpertise(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/** Une fiche complète, chargée à l'ouverture d'un dialogue. */
export function useConsultant(id: string | undefined) {
  return useQuery<Consultant>({
    queryKey: ['consultant', id],
    queryFn: () => consultantsApi.get(id as string),
    enabled: Boolean(id),
  })
}

/**
 * La LIGNE DE VIVIER d'un talent — la matière de l'entête de sa fiche.
 *
 * Distincte de `useConsultant` à dessein : celle-là rend la ligne SQL, celle-ci
 * la ligne DÉRIVÉE (disponibilité déduite des affectations, compétences
 * comptées, présence d'un CV). `staleTime` court, comme la recherche : une
 * affectation posée par un collègue change la disponibilité affichée.
 */
export function useTalentSummary(id: string | undefined) {
  return useQuery<TalentRow>({
    queryKey: ['talent', id, 'summary'],
    queryFn: () => consultantsApi.summary(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
  })
}

/** Ce que la suppression emportera — lu AVANT que le bouton rouge n'apparaisse. */
export function useTalentDeletionPreview(id: string | undefined) {
  return useQuery({
    queryKey: ['consultant', id, 'deletion-preview'],
    queryFn: () => consultantsApi.deletionPreview(id as string),
    enabled: Boolean(id),
    staleTime: 0,
  })
}

/** Le dépôt d'un CV. Invalide le vivier : la nouvelle fiche doit apparaître. */
export function useCvIntake() {
  const qc = useQueryClient()
  return useMutation<CvIntakeResult, Error, CvIntakeInput>({
    mutationFn: input => consultantsApi.intake(input),
    onSuccess: result => {
      // #2327.17 — un CV rattaché ('updated') change aussi la fiche : ses documents.
      if (result.outcome === 'duplicates') return
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    },
  })
}

/**
 * #2569.1 — l'import ZIP EN LOT, côté serveur. Chaque fichier de l'archive a
 * déjà sa décision automatique (créer / rejoindre / isoler) : le rapport ne
 * porte plus qu'une question, jamais un choix. Invalide le vivier — un lot
 * peut créer et mettre à jour des fiches en une seule requête.
 */
export function useCvZipImport() {
  const qc = useQueryClient()
  return useMutation<CvBatchImportReport, Error, CvZipImportInput>({
    mutationFn: input => consultantsApi.intakeZip(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    },
  })
}

/**
 * #3065 (lot 2b) — au-delà de `CV_ZIP_MAX_ARCHIVE_BYTES`, le même geste
 * (choisir une archive, obtenir un rapport) mais par un chemin différent :
 * dépôt direct dans le stockage, puis traitement en streaming. Le rapport
 * final a la MÊME forme que {@link useCvZipImport} — aucun second écran.
 */
export function useCvZipLargeImport() {
  const qc = useQueryClient()
  return useMutation<
    CvBatchImportReport,
    Error,
    { file: File; onProgress?: (event: CvZipLargeImportProgressEvent) => void }
  >({
    mutationFn: ({ file, onProgress }) => importCvZipLarge(file, onProgress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    },
  })
}

/**
 * #2431.6 (épopée #2883) — le manifeste (nombre de fichiers, doublons dans le
 * lot), lu AVANT `useCvZipImport`. Une mutation, comme l'import lui-même :
 * elle envoie l'archive au serveur, mais n'écrit rien — aucune invalidation.
 */
export function useCvZipManifest() {
  return useMutation<CvZipManifest, Error, CvZipImportInput>({
    mutationFn: input => consultantsApi.intakeZipManifest(input),
  })
}

/**
 * #2326.6 (épopée #2794) — un DOSSIER entier de CV, même décision automatique
 * que {@link useCvZipImport} (créer / rejoindre / isoler), sans passer par une
 * archive ZIP.
 */
export function useCvFilesImport() {
  const qc = useQueryClient()
  return useMutation<CvBatchImportReport, Error, CvFilesImportInput>({
    mutationFn: input => consultantsApi.intakeFiles(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    },
  })
}

/** #2326.6 — le manifeste d'un dossier, lu AVANT `useCvFilesImport`. N'écrit rien. */
export function useCvFilesManifest() {
  return useMutation<CvZipManifest, Error, CvFilesImportInput>({
    mutationFn: input => consultantsApi.intakeFilesManifest(input),
  })
}

/**
 * #2326.12 (épopée #2794) — L'ORCHESTRATEUR ASYNCHRONE : dépose le job et
 * rend la main tout de suite. Aucune invalidation ici — le vivier ne bouge
 * QUE quand le job avance, c'est `useCvBatchImportJobStatus` (juste en
 * dessous) qui invalide à chaque poll qui rend une nouvelle fiche.
 */
export function useCvZipImportJob() {
  return useMutation<{ jobId: string; total: number }, Error, CvZipImportInput>({
    mutationFn: input => consultantsApi.intakeZipJob(input),
  })
}

/** #2326.12 — même orchestrateur, pour un DOSSIER (#2326.6). */
export function useCvFilesImportJob() {
  return useMutation<{ jobId: string; total: number }, Error, CvFilesImportInput>({
    mutationFn: input => consultantsApi.intakeFilesJob(input),
  })
}

/** Cadence de suivi — un import dure quelques secondes à quelques minutes ;
 *  interroger plus souvent ne le rendrait pas plus rapide, seulement plus bruyant. */
const CV_BATCH_IMPORT_POLL_MS = 1_500

/**
 * #2326.24/.27 — LA PROGRESSION D'UN JOB, en vol puis son rapport final.
 *
 * Repose sur un simple poll (`refetchInterval`), jamais une supposition sur la
 * durée : le job dit lui-même quand il est `done`/`failed`, et c'est cet état
 * qui arrête le poll — pas un délai deviné. Survit à un rechargement de page
 * (#2326.27, la reprise après déconnexion) : `jobId` suffit à retrouver le
 * MÊME job, qui a continué d'avancer côté serveur pendant l'absence.
 *
 * Même patron que `useOrgRebuild` : le poll s'arrête sur l'état de la donnée,
 * et l'invalidation du vivier vit dans un effet séparé, sur la TRANSITION
 * « en cours → terminé » — jamais dans `refetchInterval`, qui peut être
 * ré-évalué plusieurs fois sans qu'un état ait réellement changé.
 */
export function useCvBatchImportJobStatus(jobId: string | null) {
  const qc = useQueryClient()
  const wasRunning = useRef(false)

  const query = useQuery<CvBatchImportJobState>({
    queryKey: ['talents', 'intake-job', jobId],
    queryFn: () => consultantsApi.intakeJobState(jobId as string),
    enabled: !!jobId,
    refetchInterval: q => {
      const status = q.state.data?.status
      return status === 'done' || status === 'failed' ? false : CV_BATCH_IMPORT_POLL_MS
    },
  })

  const status = query.data?.status
  const running = status === 'queued' || status === 'processing'

  useEffect(() => {
    if (running) {
      wasRunning.current = true
      return
    }
    if (!wasRunning.current) return
    wasRunning.current = false
    if (status === 'done') {
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    }
  }, [running, status, qc])

  return query
}

/** #2568.1 — une pièce jointe d'un fil autorisé devient une fiche du vivier. */
export function useCvMailImport() {
  const qc = useQueryClient()
  return useMutation<CvBatchFileOutcome, Error, CvMailImportInput>({
    mutationFn: input => consultantsApi.intakeMail(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    },
  })
}

/** #2183.5 — un lot de consultants depuis un fichier CSV. Même règle
 *  d'invalidation que les deux imports voisins. */
export function useCvCsvImport() {
  const qc = useQueryClient()
  return useMutation<ConsultantCsvImportReport, Error, string>({
    mutationFn: content => consultantsApi.importCsv(content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    },
  })
}

/** #2326.7/.9 — un tableau de disponibilités met à jour des fiches existantes,
 *  même règle d'invalidation que l'import CSV voisin. */
export function useAvailabilityImport() {
  const qc = useQueryClient()
  return useMutation<AvailabilityImportReport, Error, { format: 'csv' | 'xlsx'; content: string }>({
    mutationFn: ({ format, content }) => consultantsApi.importAvailability(format, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    },
  })
}

/** #2326.8 — le vivier entier, pour l'export ATS (pas de mutation de données,
 *  déclenché à la demande — pas une query montée en continu). */
export function useAtsExport() {
  return useMutation<AtsExportReport, Error, void>({
    mutationFn: () => consultantsApi.exportAts(),
  })
}

/** Même cadence que le suivi d'import de CV en lot (`CV_BATCH_IMPORT_POLL_MS`) —
 *  un export dure quelques secondes à quelques minutes, interroger plus
 *  souvent ne le rendrait pas plus rapide. */
const BULK_EXPORT_POLL_MS = 1_500

/**
 * #1952.6 (épopée #2844) — LANCER l'export en lot du vivier ENTIER, sans le
 * plafond `ATS_EXPORT_MAX_ROWS` de l'export ATS synchrone ci-dessus. Le
 * moteur (file BullMQ, service, contrôleur) était livré et testé depuis le
 * lot SRC5 (28/09 soir) sans qu'aucun appelant web ne l'atteigne jamais —
 * « du code juste, calculé, testé, que personne n'appelle » (CLAUDE.md).
 */
export function useBulkExportEnqueue() {
  return useMutation<BulkExportJobView, Error, void>({
    mutationFn: () => consultantsApi.enqueueBulkExport(),
  })
}

/**
 * Le suivi du job, une fois lancé — même patron que
 * `useCvBatchImportJobStatus` (poll, arrêté par l'état du job lui-même,
 * jamais par un délai deviné).
 */
export function useBulkExportJobStatus(jobId: string | null) {
  return useQuery<BulkExportJobView>({
    queryKey: ['talents', 'bulk-export-job', jobId],
    queryFn: () => consultantsApi.bulkExportJobState(jobId as string),
    enabled: !!jobId,
    refetchInterval: q => {
      const status = q.state.data?.status
      return status === 'done' || status === 'failed' ? false : BULK_EXPORT_POLL_MS
    },
  })
}

/** Même cadence que l'export en lot ci-dessus — une réécriture de CV appelle
 *  un modèle par consultant, quelques secondes à quelques minutes. */
const BULK_CV_REWRITE_POLL_MS = 1_500

/**
 * #1952.5 (épopée #2844, 30/09/2026) — LANCER la réécriture de CV en lot,
 * pour plusieurs consultants d'un même besoin. Le moteur (file BullMQ,
 * service, contrôleur `consultants/cv-rewrite/bulk`) était livré et testé
 * depuis le lot SRC5/S06 (28-29/09) sans qu'aucun appelant web ne l'atteigne
 * jamais — même trou que {@link useBulkExportEnqueue} avant #1952.6.
 */
export function useBulkCvRewriteEnqueue() {
  return useMutation<BulkCvRewriteJobView, Error, { opportunityId: string; consultantIds: readonly string[] }>({
    mutationFn: ({ opportunityId, consultantIds }) => consultantsApi.enqueueBulkCvRewrite(opportunityId, consultantIds),
  })
}

/** Le suivi du job, même patron que `useBulkExportJobStatus`. */
export function useBulkCvRewriteJobStatus(jobId: string | null) {
  return useQuery<BulkCvRewriteJobView>({
    queryKey: ['consultants', 'bulk-cv-rewrite-job', jobId],
    queryFn: () => consultantsApi.bulkCvRewriteJobState(jobId as string),
    enabled: !!jobId,
    refetchInterval: q => {
      const status = q.state.data?.status
      return status === 'done' || status === 'failed' ? false : BULK_CV_REWRITE_POLL_MS
    },
  })
}

/**
 * Les pièces jointes d'UN message — lues à la demande, jamais pour tous les
 * messages d'un fil d'un coup : la messagerie connectée est interrogée un
 * message à la fois (#2568.1).
 */
export function useMailAttachments(messageId: string | null) {
  return useQuery<MailAttachment[]>({
    queryKey: ['mailbox', 'attachments', messageId],
    queryFn: () => consultantsApi.mailAttachments(messageId as string),
    enabled: messageId !== null,
    staleTime: 30_000,
  })
}

/**
 * Lit le CV et propose. Déclenché par l'ouverture de l'écran de revue.
 *
 * `staleTime: Infinity` et pas de nouvelle tentative : relire le même CV coûte
 * un appel de modèle et rendrait des champs LÉGÈREMENT différents, sous les
 * yeux de quelqu'un en train de les valider.
 */
export function useParseCv(id: string | undefined) {
  return useQuery<CvParseProposal>({
    queryKey: ['consultant', id, 'cv-parse'],
    queryFn: () => consultantsApi.parseCv(id as string),
    enabled: Boolean(id),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/**
 * Écrit ce qui a été validé — le seul chemin qui qualifie une fiche.
 *
 * Lot 19 (#1789) — « Compétences 0 » affichée juste après une validation dont
 * les 8 compétences sont pourtant EN BASE (`consultants.stack`, et le
 * référentiel typé). Deux lectures du même talent, deux clés de cache :
 * `useConsultant` (`['consultant', id]`, la ligne SQL) était invalidée,
 * `useTalentSummary` (`['talent', id, 'summary']`, la ligne DÉRIVÉE que
 * `TalentCompletenessScore`/`TalentDetailHeader` affichent) ne l'était pas —
 * elle restait servie depuis le cache jusqu'à l'expiration de son
 * `staleTime` (15 s). La carte de complétude lisait donc l'ANCIEN
 * `skillCount`, celui d'avant la revue.
 */
export function useCommitCvParse(id: string) {
  const qc = useQueryClient()
  return useMutation<CvCommitOutcome, Error, CvCommitInput>({
    mutationFn: input => consultantsApi.commitCvParse(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultant', id] })
      qc.invalidateQueries({ queryKey: ['talent', id, 'summary'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
    },
  })
}

/** Les versions d'un dossier de compétences. */
export function useCvVersions(id: string | undefined) {
  return useQuery({
    queryKey: ['consultant', id, 'cv-versions'],
    queryFn: () => consultantsApi.cvVersions(id as string),
    enabled: Boolean(id),
    select: response => response.items,
  })
}

/** Compose une version — elle S'AJOUTE, elle n'écrase pas. */
export function useGenerateCvVersion(id: string) {
  const qc = useQueryClient()
  return useMutation<CvVersion, Error, GenerateCvVersionInput>({
    mutationFn: input => consultantsApi.generateCvVersion(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultant', id, 'cv-versions'] }),
  })
}

/** Le geste humain de validation (#2333.8/.9). */
export function useValidateCvVersion(id: string) {
  const qc = useQueryClient()
  return useMutation<CvVersion, Error, string>({
    mutationFn: versionId => consultantsApi.validateCvVersion(id, versionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultant', id, 'cv-versions'] }),
  })
}

/** L'action « Comparer » (#2187.42) — le diff entre deux versions choisies. */
export function useCompareCvVersions(id: string) {
  return useMutation<CvVersionDiff, Error, { a: string; b: string }>({
    mutationFn: ({ a, b }) => consultantsApi.compareCvVersions(id, a, b),
  })
}

/** L'action « Modifier » (#2187.42) — réservée à une version pas encore validée. */
export function useUpdateCvVersionSections(id: string) {
  const qc = useQueryClient()
  return useMutation<CvVersion, Error, { versionId: string; sections: { title: string; body: string }[] }>({
    mutationFn: ({ versionId, sections }) => consultantsApi.updateCvVersionSections(id, versionId, sections),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultant', id, 'cv-versions'] }),
  })
}

/** Les effectifs du pool. `staleTime` court : un contact noté ce matin change
 *  les compteurs, et un pool périmé se lit comme un pool faux. */
export function usePoolCounts() {
  const { user } = useSession()
  return useQuery({
    queryKey: ['talents', 'pool', user?.id],
    queryFn: () => consultantsApi.poolCounts(),
    enabled: !!user,
    staleTime: 30_000,
    select: response => response.items,
  })
}

export function usePoolSegment(segment: TalentPoolSegment) {
  return useQuery({
    queryKey: ['talents', 'pool', segment],
    queryFn: () => consultantsApi.poolSegment(segment),
    staleTime: 30_000,
    select: response => response.items,
  })
}

export function useTalentMissions(id: string | undefined) {
  return useQuery({
    queryKey: ['consultant', id, 'missions'],
    queryFn: () => consultantsApi.missions(id as string),
    enabled: Boolean(id),
    select: response => response.items,
  })
}

/**
 * L'historique des taux. La requête est tentée pour tout le monde : sans
 * `finance:read` le serveur répond 403, et le panneau dit « pas ton périmètre »
 * plutôt que d'afficher une liste vide qui se lirait « aucun changement ».
 */
export function useTalentRateHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['consultant', id, 'rate-history'],
    queryFn: () => consultantsApi.rateHistory(id as string),
    enabled: Boolean(id),
    retry: false,
    select: response => response.items,
  })
}

export function useArchiveTalent() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, { id: string; reason: string | null }>({
    mutationFn: ({ id, reason }) => consultantsApi.archive(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/**
 * #2662.2 — archive une SÉLECTION en un geste (« nettoyer mon vivier »).
 * Même invalidation que `useArchiveTalent` : la liste, le pool et la fiche.
 */
export function useArchiveTalentsBulk() {
  const qc = useQueryClient()
  return useMutation<ConsultantArchiveBulkResult, Error, { ids: readonly string[]; reason: string | null }>({
    mutationFn: ({ ids, reason }) => consultantsApi.archiveBulk(ids, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/**
 * Théo C talents-vivier.A12 — l'étoile d'une ligne : poser ou retirer MON favori.
 * La liste est relue (le drapeau `isFavorite` des lignes et le filtre « Mes favoris » en dépendent).
 */
export function useSetTalentFavorite() {
  const qc = useQueryClient()
  return useMutation<{ id: string; is_favorite: boolean }, Error, { id: string; isFavorite: boolean }>({
    mutationFn: ({ id, isFavorite }) => consultantsApi.setFavorite(id, isFavorite),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents'] })
    },
  })
}

export function useReactivateTalent() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, string>({
    mutationFn: id => consultantsApi.reactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/**
 * #2185.10 — « Suivi par » : désigne (ou retire, `null`) le référent
 * commercial de la fiche. Route à part de l'édition générale, même patron
 * que le manager client d'une mission (#2836).
 */
export function useSetTalentOwner() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, { id: string; ownerUserId: string | null }>({
    mutationFn: ({ id, ownerUserId }) => consultantsApi.setOwner(id, ownerUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/**
 * #2185.48 — « Valider disponibilité » : revalide la disponibilité DÉCLARÉE
 * sans en changer la valeur (voir `ConsultantsService.confirmAvailability`).
 */
export function useConfirmTalentAvailability() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, string>({
    mutationFn: id => consultantsApi.confirmAvailability(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/** #2948 (#2329.47) — « TJM validé », un axe de l'accord à 7 conditions. */
export function useConfirmTjmValidated() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, string>({
    mutationFn: id => consultantsApi.confirmTjmValidated(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/** #2948 (#2329.51) — « CV validé ou règles d'usage acceptées ». */
export function useConfirmCvValidated() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, string>({
    mutationFn: id => consultantsApi.confirmCvValidated(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/** BEL-SC-238 (#3267) — un trait observé en ENTRETIEN, jamais un CV. */
export function useRecordInterviewTrait() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, { id: string; input: RecordTalentInterviewTraitInput }>({
    mutationFn: ({ id, input }) => consultantsApi.recordInterviewTrait(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/** BEL-SC-238 (#3267) — le temps avant efficacité ANNONCÉ en entretien. */
export function useRecordRampUp() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, { id: string; input: RecordTalentRampUpInput }>({
    mutationFn: ({ id, input }) => consultantsApi.recordRampUp(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

/** #3406 — capitalise une information TERRAIN remontée par ce consultant. */
export function useRecordFieldReport() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, { id: string; input: RecordConsultantFieldReportInput }>({
    mutationFn: ({ id, input }) => consultantsApi.recordFieldReport(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant'] })
    },
  })
}

export function useCreateConsultant() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, ConsultantUpsert>({
    mutationFn: input => consultantsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
    },
  })
}

export function useUpdateConsultant() {
  const qc = useQueryClient()
  return useMutation<Consultant, Error, { id: string; input: ConsultantUpsert }>({
    mutationFn: ({ id, input }) => consultantsApi.update(id, input),
    // #3167 (retour bêta, 28/09/2026) — « les informations ne se sont pas
    // mises à jour sur la fiche » après le formulaire d'édition
    // (`ConsultantFormDialog` → `TalentDetailPage.submit`). Cette mutation
    // invalidait `['consultants']` et `['talents']`, jamais `['consultant',
    // id]` — la clé que `useConsultant` lit, exactement celle que la fiche
    // affiche — ni `['talent', id, 'summary']` — celle de `useTalentSummary`
    // (l'entête, la disponibilité dérivée, la complétude). Ses sept sœurs
    // de ce fichier (`useArchiveTalent`, `useReactivateTalent`,
    // `useSetTalentOwner`, `useConfirmTalentAvailability`,
    // `useConfirmTjmValidated`, `useConfirmCvValidated`) invalident déjà
    // `['consultant']` ; `useCommitCvParse` (#1789/#1790, plus haut dans ce
    // fichier) invalide déjà les deux — même défaut, même fiche, corrigé une
    // seconde fois faute d'avoir été tenu à un seul endroit la première.
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      qc.invalidateQueries({ queryKey: ['consultant', variables.id] })
      qc.invalidateQueries({ queryKey: ['talent', variables.id, 'summary'] })
    },
  })
}

/**
 * #3781 — « supprimer définitivement » une SÉLECTION : l'effacement RGPD de
 * personnes du vivier. Rien n'est retiré optimistiquement (irréversible : une
 * fiche qui disparaîtrait avant que le serveur l'ait supprimée ferait croire à
 * un effacement qui n'a pas eu lieu). Les lectures des fiches effacées sont
 * RETIRÉES du cache, la liste et le pool sont invalidés.
 */
export function useEraseTalents() {
  const qc = useQueryClient()
  return useMutation<ConsultantErasureResult, Error, readonly string[]>({
    mutationFn: ids => consultantsApi.eraseBulk(ids),
    onSuccess: result => {
      for (const id of result.erased) qc.removeQueries({ queryKey: ['consultant', id] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
    },
  })
}

/**
 * Supprimer UNE fiche (menu de la ligne) : le MÊME effacement que le lot — une
 * seule voie de suppression, avec sa trace, plutôt qu'un `DELETE` qui laissait
 * la personne revenir au prochain import. Une fiche laissée en place (droit
 * manquant, affectation en cours) est une ERREUR dite, jamais un succès muet.
 */
export function useDeleteConsultant() {
  const erase = useEraseTalents()
  return {
    isPending: erase.isPending,
    mutateAsync: async (id: string): Promise<{ removed: boolean }> => {
      const result = await erase.mutateAsync([id])
      const skipped = result.skipped[0]
      if (skipped) throw new Error(i18n.t(`consultants:erase.reasons.${skipped.reason}`))
      return { removed: true }
    },
  }
}

/** Les besoins du portefeuille — la source du sélecteur de matching. */
export function useOpportunitiesForMatch() {
  const { user } = useSession()
  return useQuery({
    queryKey: ['consultants-opportunities', user?.id],
    queryFn: consultantsApi.listOpportunities,
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** Le matching d'un besoin contre le vivier. Désactivé tant qu'aucun besoin
 *  n'est choisi — lecture pure, aucun débit. */
export function useConsultantMatch(opportunityId: string | null) {
  return useQuery({
    queryKey: ['consultant-match', opportunityId],
    queryFn: () => consultantsApi.match(opportunityId as string),
    enabled: !!opportunityId,
    staleTime: 10_000,
  })
}

/**
 * La prospection inversée vers le MARCHÉ (§6.2) : où placer ce consultant, en
 * dehors des besoins internes.
 *
 * Auto-chargée sans geste — contrairement à `match-inverse` ci-dessous, c'est
 * une LECTURE de relevés déjà collectés (aucun crédit, aucun journal). La
 * classer en `useQuery` plutôt qu'en action explicite est donc honnête : rien
 * ne se déclenche que l'utilisateur n'ait pas provoqué en ouvrant l'écran.
 */
export function useReverseMarket(consultantId: string | undefined) {
  return useQuery({
    queryKey: ['reverse-market', consultantId],
    queryFn: () => consultantsApi.reverseMarket(consultantId as string),
    enabled: !!consultantId,
    staleTime: 30_000,
  })
}

/**
 * #2570 — enrichissement d'une fiche du vivier, sur GESTE explicite (1
 * crédit, même monnaie qu'un enrichissement de contact). `useReverseMarket`
 * ci-dessus est une LECTURE auto-chargée ; ceci est une ÉCRITURE, donc une
 * mutation qui n'a lieu qu'au clic — jamais au montage de l'écran.
 */
export function useEnrichTalent(consultantId: string | undefined) {
  const qc = useQueryClient()
  // #3831.1 — `apolloId` optionnel : l'homonyme CHOISI via `useSearchTalentByName`
  // ci-dessous, présent seulement quand la fiche n'a pas de profil LinkedIn.
  return useMutation<TalentEnrichmentResult, Error, { apolloId?: string } | void>({
    mutationFn: payload => consultantsApi.enrich(consultantId as string, payload?.apolloId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultant', consultantId] })
      qc.invalidateQueries({ queryKey: ['talents'] })
    },
  })
}

/**
 * H-DECISIONS #4348 — pré-remplir une fiche depuis l'URL d'un profil LinkedIn.
 * Aucune écriture : le brouillon revient à l'écran, l'enregistrement reste un
 * autre geste. Un succès débite un crédit (le solde se rafraîchit).
 */
export function useLinkedinLookup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => consultantsApi.linkedinLookup(url),
    onSuccess: result => {
      if (result.found) qc.invalidateQueries({ queryKey: ['credits'] })
    },
  })
}

/**
 * #3831.1 — « je tape un nom, je vois les homonymes, je choisis ». Recherche
 * GRATUITE (tier Apollo People-Search) : aucun crédit débité, aucune écriture
 * — le reveal (`useEnrichTalent` ci-dessus, avec l'homonyme CHOISI) reste le
 * geste payant et séparé.
 */
export function useSearchTalentByName() {
  return useMutation({
    mutationFn: (input: { fullName: string; organizationName?: string }) =>
      consultantsApi.searchByName(input.fullName, input.organizationName),
  })
}

/**
 * #2288.4 — LE PLAN DE VÉRIFICATION, AVANT LE GESTE PAYANT.
 *
 * `enabled` sur une présélection NON VIDE : tant que rien n'est coché, il n'y a
 * pas de plan à demander — et surtout pas un plan à zéro candidat qui
 * s'afficherait comme un devis. La présélection ne coûte rien et n'appelle
 * personne : c'est l'étape 1, elle reste locale jusqu'à ce qu'on coche.
 *
 * `staleTime: 0` : le serveur recompte les reçus conservés à chaque ouverture —
 * un prix annoncé d'après un cache serait un prix d'hier.
 */
export function useMarketVerificationPlan(consultantId: string | undefined, companies: readonly string[]) {
  return useQuery({
    queryKey: ['market-verification-plan', consultantId, [...companies].sort()],
    queryFn: () => consultantsApi.marketVerificationPlan(consultantId as string, companies),
    enabled: !!consultantId && companies.length > 0,
    staleTime: 0,
  })
}

/**
 * #2288.2 (décision Louis, 18/09/2026) — LES ÉTATS DE VÉRIFICATION, pour la
 * colonne et le seau « Vérifiés ». Lisibles par TOUT membre (un `viewer`
 * compris) : aucun montant, aucun crédit. Une liste vide ne demande rien.
 */
export function useMarketVerificationStates(consultantId: string | undefined, companies: readonly string[]) {
  return useQuery({
    queryKey: ['market-verification-states', consultantId, [...companies].sort()],
    queryFn: () => consultantsApi.marketVerificationStates(consultantId as string, companies),
    enabled: !!consultantId && companies.length > 0,
    staleTime: 30_000,
  })
}

/**
 * #2288.2 (décision Louis, 18/09/2026) — CONFIRMER LANCE TOUTES LES ENTREPRISES
 * COCHÉES, et inscrit un reçu par lancement (`launchVerifications`).
 *
 * Une MUTATION, jamais au montage : rien ne part sans geste. À la fin — succès
 * partiel compris — le devis et les états sont relus, pour que les entreprises
 * qui viennent d'entrer en conservation sortent du prochain coût.
 *
 * `start` est INJECTÉ par l'écran qui monte le devis (GA-86) : la route qui
 * débite vit dans le module qui a nommé le coût, jamais dans un client d'API
 * que n'importe quel écran pourrait appeler sans annonce.
 *
 * #2288.4 (18/09, suite) — `knownSirens` voyage jusqu'au lanceur : une lecture
 * DÉJÀ FAITE par l'appelant (la colonne « Vérification », qui porte déjà le
 * SIREN connu de chaque entreprise), jamais devinée ici.
 */
export function useLaunchMarketVerifications(
  consultantId: string | undefined,
  start: (companyName: string, siren?: string) => Promise<unknown>,
) {
  const qc = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof launchVerifications>>,
    Error,
    { companies: readonly string[]; knownSirens?: ReadonlyMap<string, string> }
  >({
    mutationFn: ({ companies, knownSirens }) =>
      launchVerifications(
        companies,
        {
          start,
          record: (companyName, outcome) =>
            consultantsApi.recordMarketVerification(consultantId as string, { companyName, outcome }),
        },
        { knownSirens },
      ),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['market-verification-plan', consultantId] })
      qc.invalidateQueries({ queryKey: ['market-verification-states', consultantId] })
    },
  })
}

/**
 * #2968 — les entreprises MASQUÉES par l'appelant sur ce consultant, lisible
 * par tout membre (geste personnel et gratuit, sans montant).
 */
export function useReverseMarketDismissedCompanies(consultantId: string | undefined) {
  return useQuery({
    queryKey: ['reverse-market-dismissals', consultantId],
    queryFn: () => consultantsApi.reverseMarketDismissedCompanies(consultantId as string),
    enabled: !!consultantId,
    staleTime: 30_000,
  })
}

/**
 * #2968 — MASQUER / DÉMASQUER une entreprise d'« Environnements
 * compatibles ». Une seule mutation pour les deux gestes (même endpoint,
 * verbe HTTP différent) : ils partagent la même invalidation, et un écran qui
 * bascule un état n'a besoin que d'UN hook.
 */
export function useSetReverseMarketDismissed(consultantId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { companyName: string; dismissed: boolean }>({
    mutationFn: ({ companyName, dismissed }) =>
      dismissed
        ? consultantsApi.dismissReverseMarketCompany(consultantId as string, companyName)
        : consultantsApi.restoreReverseMarketCompany(consultantId as string, companyName),
    onSettled: () => qc.invalidateQueries({ queryKey: ['reverse-market-dismissals', consultantId] }),
  })
}
