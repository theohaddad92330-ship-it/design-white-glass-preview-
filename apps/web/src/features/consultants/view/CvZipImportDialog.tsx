import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import {
  IMPORT_FILE_MAX_LABEL,
  countScanSuspects,
  cvBatchBreakdown,
  cvZipImportRoute,
  type CvBatchImportReport,
  type CvZipImportJobProgress,
  type CvZipManifest,
} from '@bellum/contracts'
import { Archive, FolderUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useCvBatchImportJobStatus,
  useCvFilesImportJob,
  useCvFilesManifest,
  useCvZipImportJob,
  useCvZipLargeImport,
  useCvZipManifest,
} from '../hooks'
import type { CvZipLargeImportProgressEvent } from '../api'
import { fileToBase64 } from '../lib/fileToBase64'
import { filterCvBatchFiles, formatRemainingCv } from '../lib/cvBatch'
import { CvImportNextSteps } from './CvImportNextSteps'
import { ImportFamilyReport } from '@/features/universal-import/view/ImportFamilyReport'

/** #2326.6 (épopée #2794) — une source de lot, une archive OU un dossier ; le
 *  reste de l'écran (manifeste, confirmation, rapport) est le MÊME pour les
 *  deux, seule la manière de rassembler les octets diffère. #3065 (lot 2b) —
 *  `'large'` est une TROISIÈME source : une archive au-delà du transport
 *  inline, sans manifeste (le lire supposerait de dépaqueter l'archive dans
 *  le navigateur, coûteux pour plusieurs centaines de mégaoctets) — la
 *  confirmation porte directement sur sa taille. */
type PendingSource = { kind: 'zip'; file: File } | { kind: 'folder'; files: File[] } | { kind: 'large'; file: File }

/** Octets → Mo entiers, jamais 0 pour une valeur présente (« non mesuré » n'est pas 0). */
function megabytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / (1024 * 1024)))
}

/** Le texte de la phase `running` — `total` `null` tant que le répertoire de
 *  l'archive n'a pas fini d'être lu côté serveur (« non mesuré » n'est jamais 0).
 *  Incident 05/10/2026 : `phase` dit OÙ en est le job avant son premier fichier
 *  (téléchargement, ouverture) ; sans phase (ancien statut), texte inchangé. */
function runningProgressText(
  progress: CvZipImportJobProgress | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!progress) return t('batchImport.zip.large.runningUnknown', { processed: 0 })
  if (progress.phase === 'open') return t('batchImport.zip.large.opening')
  if (progress.phase === 'download') {
    const received = progress.bytesDownloaded
    if (typeof received !== 'number' || received <= 0) return t('batchImport.zip.large.downloadingUnknown')
    const total = progress.bytesTotal
    return typeof total === 'number' && total > 0
      ? t('batchImport.zip.large.downloadingKnown', { received: megabytes(received), total: megabytes(total) })
      : t('batchImport.zip.large.downloadingReceived', { received: megabytes(received) })
  }
  return progress.total === null
    ? t('batchImport.zip.large.runningUnknown', { processed: progress.processed })
    : t('batchImport.zip.large.runningKnown', { processed: progress.processed, total: progress.total })
}

/**
 * #2569.1 — importer une archive ZIP entière de CV, depuis le vivier.
 *
 * #2326.12 (épopée #2794, LOT r5 26/09) — L'IMPORT NE BOUCLE PLUS DANS LA
 * REQUÊTE : la confirmation dépose un JOB (`POST intake/zip/jobs` ou
 * `intake/files/jobs`) et l'écran SUIT sa progression (`useCvBatchImportJobStatus`),
 * au lieu d'attendre le lot entier en silence — c'est l'ORCHESTRATEUR ASYNCHRONE
 * de l'épopée #2794, dont le manque était nommé depuis plusieurs lots de nuit
 * (`git grep BullModule` dans `apps/api/src/modules/consultants` rendait 0
 * résultat). Le job survit à un rechargement de page (#2326.27) : `jobId` est
 * conservé dans l'état local du dialogue, et rouvrir l'écran avec le même
 * identifiant retrouve exactement où le lot en est.
 *
 * Quatre règles portent tout l'écran :
 *  - Louis 06/10/2026 : plus aucun plafond en nombre de fichiers — le
 *    manifeste ne dit plus de borne (seuls les octets restent bornés) ;
 *  - le rapport nomme CHAQUE fichier qui n'est pas devenu une fiche neuve ou
 *    une mise à jour, avec sa raison — jamais un compte agrégé seul ;
 *  - #2431.6 (épopée #2883) — un MANIFESTE (nombre de fichiers, doublons dans
 *    le lot) se lit AVANT le traitement massif, et attend une confirmation
 *    explicite : `POST /talents/intake/zip/manifest` n'écrit rien.
 *    Coût et durée n'y figurent pas — aucun des deux calculs n'existe dans le
 *    dépôt ; en inventer un afficherait une donnée fictive (voir l'en-tête de
 *    `buildCvZipManifest`, @bellum/contracts) ;
 *  - #2326.12 — la confirmation dépose un JOB et REND LA MAIN : aucun écran ne
 *    reste bloqué sur un lot de 300 fichiers, la progression s'affiche pendant
 *    que le job avance en tâche de fond.
 */
/**
 * `initialOpen` — #1952.4 (épopée #2844) : le dépôt PRÉ-CIBLÉ que Laura ouvre
 * depuis la conversation (`/consultants?importCv=true`). Une amorce, comme
 * `?new=` ouvre `ConsultantFormDialog` : posée au premier rendu seulement —
 * fermer le dialogue ne le rouvre pas tout seul au prochain rendu.
 */
export function CvZipImportDialog({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const { t } = useTranslation('consultants')
  const [open, setOpen] = useState(initialOpen)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingSource | null>(null)
  const [manifest, setManifest] = useState<CvZipManifest | null>(null)
  const [largeProgress, setLargeProgress] = useState<CvZipLargeImportProgressEvent | null>(null)
  const [largeReport, setLargeReport] = useState<CvBatchImportReport | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const zipImportJob = useCvZipImportJob()
  const zipManifest = useCvZipManifest()
  const zipLargeImport = useCvZipLargeImport()
  const filesImportJob = useCvFilesImportJob()
  const filesManifest = useCvFilesManifest()
  const job = useCvBatchImportJobStatus(jobId)
  const isPending =
    zipManifest.isPending ||
    zipImportJob.isPending ||
    zipLargeImport.isPending ||
    filesManifest.isPending ||
    filesImportJob.isPending
  const jobRunning = job.data?.status === 'queued' || job.data?.status === 'processing'
  // #3065 (lot 2b) — l'import volumineux ne passe pas par le job : son rapport
  // vit en local, jamais dans `useCvBatchImportJobStatus`.
  const report = largeReport ?? (job.data?.status === 'done' ? job.data : null)

  const pickFile = async (file: File) => {
    setJobId(null)
    setLargeReport(null)
    setError(null)
    // #3065 — la taille décide de la route AVANT tout envoi : en ligne
    // (base64, sous `CV_ZIP_MAX_ARCHIVE_BYTES`), volumineuse (dépôt direct,
    // jusqu'à `CV_ZIP_LARGE_ARCHIVE_MAX_BYTES`), ou refusée — jamais découvert
    // par l'échec du transport, plusieurs minutes après l'envoi.
    const route = cvZipImportRoute(file.size)
    if (route === 'refused') {
      setError(
        t('batchImport.zip.tooBig', {
          sizeMb: Math.round(file.size / (1024 * 1024)),
          // #3666.9 (Louis 15/10/2026) — la limite ANNONCÉE, en clair : « 1 Go ».
          max: IMPORT_FILE_MAX_LABEL,
        }),
      )
      return
    }
    if (route === 'large') {
      setManifest(null)
      setPending({ kind: 'large', file })
      return
    }
    setManifest(null)
    setPending({ kind: 'zip', file })
    try {
      const fileB64 = await fileToBase64(file)
      const result = await zipManifest.mutateAsync({ fileB64, filename: file.name })
      setManifest(result)
    } catch (caught) {
      setError((caught as Error).message || t('batchImport.zip.manifest.failed'))
      setPending(null)
    }
  }

  /**
   * #2326.6 (épopée #2794) — un DOSSIER entier (`webkitdirectory`), même
   * filtre que le dépôt unitaire en masse (`filterCvBatchFiles`, #2183.4) :
   * un dossier réel porte des fichiers système (`.DS_Store`) et des tableurs,
   * jamais comptés comme des échecs, écartés avant tout appel réseau.
   */
  const pickFolder = async (rawFiles: File[]) => {
    setJobId(null)
    setLargeReport(null)
    setError(null)
    const files = filterCvBatchFiles(rawFiles)
    if (files.length === 0) {
      setError(t('batchImport.files.empty'))
      return
    }
    setManifest(null)
    setPending({ kind: 'folder', files })
    try {
      const encoded = await Promise.all(
        files.map(async file => ({
          filename: (file.webkitRelativePath || file.name).trim(),
          fileB64: await fileToBase64(file),
        })),
      )
      const result = await filesManifest.mutateAsync({ files: encoded })
      setManifest(result)
    } catch (caught) {
      setError((caught as Error).message || t('batchImport.zip.manifest.failed'))
      setPending(null)
    }
  }

  const cancelManifest = () => {
    setPending(null)
    setManifest(null)
  }

  /**
   * #2326.12 — dépose le job et REND LA MAIN : `zipImportJob`/`filesImportJob`
   * ne rendent qu'un `jobId`, jamais le rapport (c'est `job` — `useCvBatchImportJobStatus`
   * — qui le lit ensuite, en suivant la progression).
   */
  const confirmImport = async () => {
    if (!pending) return
    setManifest(null)
    setError(null)
    try {
      if (pending.kind === 'zip') {
        const fileB64 = await fileToBase64(pending.file)
        const { jobId: startedJobId } = await zipImportJob.mutateAsync({ fileB64, filename: pending.file.name })
        setJobId(startedJobId)
      } else if (pending.kind === 'large') {
        setLargeProgress({ phase: 'queued' })
        setLargeReport(await zipLargeImport.mutateAsync({ file: pending.file, onProgress: setLargeProgress }))
      } else {
        const files = await Promise.all(
          pending.files.map(async file => ({
            filename: (file.webkitRelativePath || file.name).trim(),
            fileB64: await fileToBase64(file),
          })),
        )
        const { jobId: startedJobId } = await filesImportJob.mutateAsync({ files })
        setJobId(startedJobId)
      }
    } catch (caught) {
      // Le message du serveur porte la RAISON (lot trop grand, archive
      // illisible, etc.) — le remplacer par un texte générique ferait
      // redéposer le même lot.
      setError((caught as Error).message || t('batchImport.zip.failed'))
    } finally {
      setPending(null)
      setLargeProgress(null)
    }
  }

  const outcomesToName = report?.outcomes.filter(outcome => outcome.status !== 'created')
  // #2183.41 (épopée #2784) — un compte agrégé UNIQUE confondait un document
  // sans calque texte (récupérable en le rescannant) avec un fichier
  // réellement en échec. `countScanSuspects` isole les scans du reste —
  // jamais une déduction sur un texte de modèle, seulement les trois motifs
  // CONTRÔLÉS que `document_text.py` émet.
  const scanSuspects = report ? countScanSuspects(report.outcomes) : 0

  // #3302 — le bouton « Fermer », un seul élément, posé soit dans la rangée des
  // gestes de confirmation (manifeste / archive volumineuse), soit au pied.
  const closeButton = (
    <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
      {t('batchImport.zip.close')}
    </Button>
  )
  const actionRowShown = manifest != null || pending?.kind === 'large'

  return (
    <>
      <Button variant="outline" size="sm" icon={Archive} onClick={() => setOpen(true)}>
        {t('batchImport.zip.cta')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) {
            setJobId(null)
            setLargeReport(null)
            setError(null)
            setPending(null)
            setManifest(null)
            setLargeProgress(null)
          }
        }}
      >
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('batchImport.zip.title')}</DialogTitle>
            <DialogDescription>{t('batchImport.zip.description')}</DialogDescription>
          </DialogHeader>

          {/* #2732.2 — les formats lus se disent AVANT le dépôt (pas des bornes : ni nombre de fichiers, ni taille). */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('batchImport.formats')}
          </Text>

          {/* #3598 — le paragraphe des plafonds (nombre de fichiers + taille) est retiré :
              bruit permanent. Les bornes se disent au REFUS (`tooBig`, manifeste). */}

          <input
            ref={inputRef}
            type="file"
            // #3303 — le type déclaré par le navigateur pour un .zip n'est
            // jamais fiable (Windows rend `application/x-zip-compressed`,
            // d'autres rien) : l'extension décide, le type ne fait qu'élargir
            // ce que le sélecteur de fichiers propose, jamais ce qu'on accepte.
            accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
            className="hidden"
            aria-label={t('batchImport.zip.choose')}
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void pickFile(file)
              // Remis à zéro : redéposer la MÊME archive redéclenche un
              // événement, sinon corriger puis réessayer ne fait rien.
              event.target.value = ''
            }}
          />
          {/* #2326.6 (épopée #2794) — un DOSSIER entier, hors d'une archive.
              `webkitdirectory` n'a pas d'équivalent standard : c'est l'attribut
              que Chrome, Firefox et Safari reconnaissent tous les trois pour un
              choix de DOSSIER plutôt que de fichiers (même attribut que
              `CvDropZone.tsx`, #2183.4). */}
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error — attribut non standard, reconnu par tous les
            // navigateurs cibles, absent des types DOM.
            webkitdirectory=""
            directory=""
            className="hidden"
            aria-label={t('batchImport.files.choose')}
            onChange={event => {
              const files = Array.from(event.target.files ?? [])
              if (files.length > 0) void pickFolder(files)
              event.target.value = ''
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isPending || jobRunning}
              onClick={() => inputRef.current?.click()}
            >
              {zipManifest.isPending
                ? t('batchImport.zip.manifest.checking')
                : zipImportJob.isPending || jobRunning
                  ? t('batchImport.zip.working')
                  : t('batchImport.zip.choose')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={FolderUp}
              disabled={isPending || jobRunning}
              onClick={() => folderInputRef.current?.click()}
            >
              {filesManifest.isPending
                ? t('batchImport.zip.manifest.checking')
                : filesImportJob.isPending || jobRunning
                  ? t('batchImport.zip.working')
                  : t('batchImport.files.choose')}
            </Button>
            {/* #3302 (recette prod 29/09) — l'état d'ARRIVÉE : « Fermer » était seul
                dans un pied (top 501 vs 453). Il rejoint la rangée des deux
                choix ; les rangées de confirmation portent le leur (GA-26). */}
            {actionRowShown ? null : closeButton}
          </div>

          {error ? (
            <Text size="sm" className="text-[var(--danger-soft-text)]">
              {error}
            </Text>
          ) : null}

          {/* #3065 (lot 2b) — l'archive volumineuse n'a pas de manifeste (le
              lire supposerait de la dépaqueter dans le navigateur) : la
              confirmation porte directement sur sa taille, puis la
              progression suit ses phases (envoi, reprise après coupure,
              attente, traitement — #3303 ajoute la reprise). */}
          {pending?.kind === 'large' ? (
            <div className="flex flex-col gap-2">
              <Text size="sm">
                {t('batchImport.zip.large.confirmTitle', { sizeMb: Math.round(pending.file.size / (1024 * 1024)) })}
              </Text>
              {/* #3599 — le rappel du plafond de la route volumineuse est retiré. */}
              {largeProgress ? (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {largeProgress.phase === 'uploading'
                    ? t('batchImport.zip.large.uploading', { percent: largeProgress.percent })
                    : largeProgress.phase === 'retrying'
                      ? t('batchImport.zip.large.retrying', { attempt: largeProgress.attempt })
                      : largeProgress.phase === 'queued'
                        ? t('batchImport.zip.large.queued')
                        : runningProgressText(largeProgress.progress, t)}
                </Text>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={isPending} onClick={() => void confirmImport()}>
                  {t('batchImport.zip.large.confirm')}
                </Button>
                <Button variant="ghost" size="sm" disabled={isPending} onClick={cancelManifest}>
                  {t('batchImport.zip.large.cancel')}
                </Button>
                {closeButton}
              </div>
            </div>
          ) : null}

          {/* #2431.6 — le manifeste : nombre de fichiers et doublons AVANT le
              traitement, avec une confirmation explicite plutôt qu'un envoi
              immédiat. */}
          {manifest ? (
            <div className="flex flex-col gap-2">
              <Text size="sm">{t('batchImport.zip.manifest.summary', { count: manifest.totalFiles })}</Text>
              {manifest.duplicateFiles > 0 ? (
                <>
                  <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t('batchImport.zip.manifest.duplicates', { count: manifest.duplicateFiles })}
                  </Text>
                  {/* #2569 — la règle de résolution se dit AVANT le traitement
                      (#2569.2 : la donnée la plus récente gagne). */}
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('batchImport.zip.manifest.duplicateRule')}
                  </Text>
                </>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={isPending || jobRunning} onClick={() => void confirmImport()}>
                  {t('batchImport.zip.manifest.confirm')}
                </Button>
                <Button variant="ghost" size="sm" disabled={isPending || jobRunning} onClick={cancelManifest}>
                  {t('batchImport.zip.manifest.cancel')}
                </Button>
                {closeButton}
              </div>
            </div>
          ) : null}

          {/* #2326.12/.24 — LE JOB EN VOL : combien de fichiers ont déjà produit
              une issue, jamais un pourcentage (même grammaire que les sept
              travaux longs de #1952, `longJobProgressSentence`). */}
          {jobRunning && job.data ? (
            <div className="flex flex-wrap items-center gap-2">
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('batchImport.zip.progress.working', { processed: job.data.processed, total: job.data.total })}
              </Text>
              {/* #1952.22 (épopée #2844) — le temps RESTANT, mesuré depuis le
                  débit RÉEL de ce job (jamais avant qu'un premier fichier
                  n'ait produit d'issue — rien à extrapoler encore). Même
                  formateur et mêmes clés que le dépôt unitaire (#2183.43,
                  `CvDropZone.tsx`) — un seul calcul d'unité (GA-26). */}
              {typeof job.data.etaSeconds === 'number' ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {(() => {
                    const remaining = formatRemainingCv(job.data.etaSeconds * 1000)
                    return t(`intake.batch.remaining${remaining.unit === 'seconds' ? 'Seconds' : 'Minutes'}`, {
                      count: remaining.count,
                    })
                  })()}
                </Text>
              ) : null}
            </div>
          ) : null}

          {job.data?.status === 'failed' ? (
            <Text size="sm" className="text-[var(--danger-soft-text)]">
              {t('batchImport.zip.progress.failed', { reason: job.data.error ?? t('batchImport.zip.failed') })}
            </Text>
          ) : null}

          {report ? (
            <div className="flex flex-col gap-2">
              <Text size="sm" weight="medium">
                {t('batchImport.zip.summary', {
                  created: report.summary.created,
                  autoUpdated: report.summary.auto_updated,
                  exception: report.summary.exception,
                  scans: scanSuspects,
                  errors: report.summary.failed - scanSuspects + report.summary.too_big,
                  // #3065 (lot 2) — un fichier « pas un CV » n'est pas une
                  // erreur : il compte à part, jamais dans `errors`.
                  ignored: report.summary.ignored,
                })}
              </Text>
              {/* #4051.2 — le bilan PAR FAMILLE : créés / mis à jour / à rapprocher / échoués, jamais « tout importé ». */}
              <ImportFamilyReport breakdown={cvBatchBreakdown(report.summary)} queryableByLaura={null} />
              {outcomesToName && outcomesToName.length > 0 ? (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                  {outcomesToName.map((outcome, index) => (
                    <li key={`${outcome.file}-${index}`}>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {outcome.status === 'auto_updated'
                          ? outcome.matchedOn
                            ? t('batchImport.zip.outcome.auto_updated', {
                                file: outcome.file,
                                reason: t(`intake.duplicate.reasons.${outcome.matchedOn}`),
                              })
                            : t('batchImport.zip.outcome.auto_updated_generic', { file: outcome.file })
                          : outcome.status === 'exception'
                            ? outcome.conflicts && outcome.conflicts.length > 0
                              ? t('batchImport.zip.outcome.exception_conflicts', {
                                  file: outcome.file,
                                  state: t(`identity.states.${outcome.state}`),
                                  conflicts: outcome.conflicts
                                    .map(field => t(`identity.conflictFields.${field}`))
                                    .join(', '),
                                })
                              : t('batchImport.zip.outcome.exception', {
                                  file: outcome.file,
                                  state: t(`identity.states.${outcome.state}`),
                                })
                            : outcome.status === 'too_big'
                              ? t('batchImport.zip.outcome.too_big', { file: outcome.file })
                              : outcome.status === 'ignored'
                                ? t('batchImport.zip.outcome.ignored', { file: outcome.file })
                                : t('batchImport.zip.outcome.failed', { file: outcome.file, reason: outcome.reason })}
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* #2183.52-.55 — les quatre gestes qui suivent un import. */}
              <CvImportNextSteps reviewCount={report.summary.exception} onNavigate={() => setOpen(false)} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
