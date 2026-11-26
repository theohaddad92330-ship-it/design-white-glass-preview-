import { Button, Input, SelectField, Text } from '@bellum/ui'
import {
  IMPORT_FILE_MAX_LABEL,
  exceedsImportLimit,
  UNIVERSAL_IMPORT_REGISTRY,
  UNIVERSAL_IMPORT_TYPES,
  universalImportFormatOf,
  type UniversalImportJobState,
  type UniversalImportMapping,
  type UniversalImportPreview,
  type UniversalImportScope,
  type UniversalImportSheetPlan,
  type UniversalImportType,
  type UniversalImportVerification,
} from '@bellum/contracts'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileText,
  Lock,
  Upload,
  X,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalPortal } from '@/components/overlay/ModalPortal'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { downloadBlob } from '@/lib/pdf-download'
import { subscribeToImportJob } from '@/lib/socket'
import {
  fetchUniversalImport,
  fetchUniversalImportReport,
  previewUniversalImport,
  resumeUniversalImport,
  startUniversalImport,
  uploadUniversalImport,
  verifyUniversalImport,
} from '../api'
import { sampleFileFor } from '../lib/sample-file'
import { ImportFamilyReport, hasFamilyReport } from './ImportFamilyReport'
import { ImportVerificationSummary } from './ImportVerificationSummary'
import { ValidateCompaniesButton } from './ValidateCompaniesButton'
import { ImportSheetsReport, SheetChoiceList, initialSheetChoice, type SheetChoice } from './UniversalImportSheets'

type Step =
  | { kind: 'choose' }
  | { kind: 'uploading'; sent: number; total: number }
  | {
      kind: 'mapping'
      jobId: string
      preview: UniversalImportPreview
      mapping: UniversalImportMapping
      fileName: string
      checking?: boolean
      /** #5223 — les feuilles cochées d'un classeur ; absent = une seule feuille (chemin d'avant). */
      sheetChoice?: SheetChoice
    }
  // Théo B c4.R3 — la vérification AVANT d'importer : « Lancer » n'existe qu'avec son rapport en main.
  | {
      kind: 'verification'
      jobId: string
      preview: UniversalImportPreview
      mapping: UniversalImportMapping
      fileName: string
      report: UniversalImportVerification
      sheetChoice?: SheetChoice
    }
  | { kind: 'running'; job: UniversalImportJobState }

type Props = {
  /** La fiche compte d'où l'import part : les contacts s'y rattachent. */
  accountId?: string | null
  /** Un type imposé (le bouton de la fiche compte importe des contacts). Absent = l'utilisateur choisit. */
  fixedType?: UniversalImportType
  /** Théo A comptes-import.N3 — ouvre directement sur le fichier d'exemple du type (contrôle avant ajout). */
  startWithSample?: boolean
  /**
   * Théo B C4 — `page` : l'assistant plein écran (Source · Colonnes · Vérification · Résultat) que « Nouvel import »
   * ouvre sur /settings/import ; `dialog` (défaut) : la fenêtre des autres appelants (fiche compte, contacts).
   */
  layout?: 'dialog' | 'page'
  /** Théo B C4 — l'onglet de source ouvert d'emblée (Fichier ou Coller un tableau). */
  initialSource?: 'file' | 'paste'
  onClose: () => void
  /** Rendu APRÈS le rapport (ex. les gestes qui suivent un import de contacts). */
  renderAfterReport?: (job: UniversalImportJobState) => React.ReactNode
}

/** Théo C4 — `.v13-chip` : les puces de source. */
const CHIP = 'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm'
const CHIP_ON =
  'border-[var(--bellum-text-accent)] bg-[var(--accent-soft-bg)] font-medium text-[var(--accent-soft-text)]'
const CHIP_OFF =
  'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]'

/** Un job encore en cours relit son état toutes les… — le filet sous Socket.IO, jamais une barre figée. */
const POLL_MS = 2_000
const ACCEPT = '.csv,.tsv,.txt,.xlsx,.json,.ndjson,.jsonl,text/csv,application/json'

/**
 * L'IMPORT UNIVERSEL (Louis 27/09/2026) — n'importe quel nombre de lignes,
 * n'importe quel type déclaré. Choisir → envoyer (par parts) → faire
 * correspondre les colonnes → suivre l'écriture en temps réel → rapport.
 *
 * Aucun plafond affiché, aucun « maximum N lignes » : si c'est gros, c'est à
 * Bellum de s'organiser. Une colonne sans champ d'accueil n'est jamais jetée —
 * elle est proposée en « informations complémentaires » (`extra`).
 */
export function UniversalImportDialog({
  accountId = null,
  fixedType,
  startWithSample = false,
  layout = 'dialog',
  initialSource = 'file',
  onClose,
  renderAfterReport,
}: Props) {
  const { t } = useTranslation('importWizard')
  const queryClient = useQueryClient()
  // Le rapport cite des libellés du fichier : il SORT des données, il lit la règle d'espace (#2081.14).
  const dataExit = useDataExit()
  const inputRef = useRef<HTMLInputElement>(null)
  const [type, setType] = useState<UniversalImportType>(fixedType ?? 'contact')
  // #2927 — qui voit les contacts importés : l'équipe (défaut) ou toi seul. Contacts rattachés à un compte seulement.
  const [scope, setScope] = useState<UniversalImportScope>('workspace')
  // #2927 / #2159.54 — hors fiche compte aussi (/contacts, Réglages › Import) : le rattachement se fait par
  // société, comme l'import d'équipe ; la portée BU reste hors périmètre.
  const scopeChoosable = type === 'contact'
  // #4052.2 — le CRM d'origine borne les références source (comptes, contacts) ; facultatif.
  const [sourceSystem, setSourceSystem] = useState('')
  const sourceChoosable = type === 'contact' || type === 'account'
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [error, setError] = useState<string | null>(null)
  // Théo B C4 — « Fichier » ou « Coller un tableau » : le tableau collé devient un fichier TSV, lu par le MÊME moteur.
  const [source, setSource] = useState<'file' | 'paste'>(initialSource)
  const [pasted, setPasted] = useState('')
  const [dragging, setDragging] = useState(false)

  const runningJobId = step.kind === 'running' ? step.job.id : null
  const runningStatus = step.kind === 'running' ? step.job.status : null
  const runningScope = step.kind === 'running' ? step.job.scope : null
  const live = runningStatus === 'queued' || runningStatus === 'processing'

  // Temps réel + filet HTTP : les deux écrivent le même état, le plus récent gagne.
  useEffect(() => {
    if (!runningJobId || !live) return
    const apply = (job: UniversalImportJobState) =>
      setStep(current => (current.kind === 'running' ? { kind: 'running', job } : current))
    const unsubscribe = subscribeToImportJob(runningJobId, apply)
    const timer = setInterval(() => {
      fetchUniversalImport(runningJobId).then(apply, () => undefined)
    }, POLL_MS)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [runningJobId, live])

  useEffect(() => {
    if (runningStatus !== 'done') return
    // Les listes qui montrent ce qui vient d'être créé se relisent.
    void queryClient.invalidateQueries({ queryKey: [type === 'account' ? 'accounts' : 'contacts'] })
    // Théo B C3 — l'historique des imports relit : le bilan de CET import y figure sans recharger la page.
    void queryClient.invalidateQueries({ queryKey: ['universal-import', 'history'] })
    if (accountId) void queryClient.invalidateQueries({ queryKey: ['account', accountId] })
    // #2927 (X76) — un import « Moi seul » n'écrit pas dans `contacts` : sans cette relecture, la salle (comme
    // la prod) importait sans que « Mes contacts personnels » ne bouge avant 30 s — le geste ne se voyait pas.
    if (runningScope === 'personal') {
      void queryClient.invalidateQueries({
        queryKey: accountId ? ['personal-contacts', accountId] : ['personal-contacts'],
      })
    }
  }, [runningStatus, runningScope, queryClient, type, accountId])

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setError(null)
    if (!universalImportFormatOf(file.name)) {
      setError(t('universal.errors.format'))
      return
    }
    // #3666.9 (Louis 15/10/2026) — au-delà de 1 Go, refusé ICI, avant tout envoi, avec sa raison.
    if (exceedsImportLimit(file.size)) {
      setError(
        t('universal.errors.tooLarge', { sizeMb: Math.round(file.size / (1024 * 1024)), max: IMPORT_FILE_MAX_LABEL }),
      )
      return
    }
    try {
      setStep({ kind: 'uploading', sent: 0, total: 1 })
      const job = await uploadUniversalImport(
        file,
        type,
        accountId,
        (sent, total) => setStep({ kind: 'uploading', sent, total }),
        {
          ...(scopeChoosable && scope === 'personal' ? { scope: 'personal' as const } : {}),
          ...(sourceChoosable && sourceSystem.trim() ? { sourceSystem: sourceSystem.trim() } : {}),
        },
      )
      const preview = await previewUniversalImport(job.id)
      const sheetChoice = initialSheetChoice(preview)
      setStep({
        kind: 'mapping',
        jobId: job.id,
        preview,
        mapping: preview.mapping,
        fileName: file.name,
        ...(sheetChoice ? { sheetChoice } : {}),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('universal.errors.generic'))
      setStep({ kind: 'choose' })
    }
  }

  // #5223 — la correspondance de CHAQUE feuille cochée : celle déjà vue ou éditée, sinon la proposition du serveur.
  const sheetPlans = async (current: Extract<Step, { kind: 'mapping' }>): Promise<SheetChoice> => {
    const { sheetChoice, preview, mapping, jobId } = current
    if (!sheetChoice) throw new Error('no sheet choice')
    const mappings = { ...sheetChoice.mappings, ...(preview.sheet ? { [preview.sheet]: mapping } : {}) }
    for (const name of sheetChoice.chosen) {
      if (!mappings[name]) mappings[name] = (await previewUniversalImport(jobId, name)).mapping
    }
    return { ...sheetChoice, mappings }
  }

  // Théo B c4 — d'abord la vérification (sans rien écrire), quelle que soit la taille du fichier.
  const verify = async (): Promise<void> => {
    if (step.kind !== 'mapping') return
    setError(null)
    const { jobId, mapping, preview, fileName } = step
    setStep({ ...step, checking: true })
    try {
      const choice = step.sheetChoice ? await sheetPlans(step) : undefined
      const report = choice
        ? await verifyUniversalImport(jobId, mapping, null, { sheets: sheetsOf(choice) })
        : await verifyUniversalImport(jobId, mapping, preview.sheet ?? null)
      setStep({
        kind: 'verification',
        jobId,
        preview,
        mapping,
        fileName,
        report,
        ...(choice ? { sheetChoice: choice } : {}),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('universal.mapping.verifyError'))
      setStep({
        kind: 'mapping',
        jobId,
        preview,
        mapping,
        fileName,
        ...(step.sheetChoice ? { sheetChoice: step.sheetChoice } : {}),
      })
    }
  }

  const launch = async (): Promise<void> => {
    if (step.kind !== 'verification') return
    setError(null)
    try {
      const { jobId, mapping, preview, sheetChoice } = step
      setStep({
        kind: 'running',
        job: sheetChoice
          ? await startUniversalImport(jobId, mapping, null, { sheets: sheetsOf(sheetChoice) })
          : preview.sheet
            ? await startUniversalImport(jobId, mapping, preview.sheet)
            : await startUniversalImport(jobId, mapping),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('universal.errors.generic'))
    }
  }

  // #4426.4 — un autre onglet du classeur : l'aperçu et la proposition de correspondance sont relus sur CET onglet.
  const changeSheet = async (sheet: string): Promise<void> => {
    if (step.kind !== 'mapping') return
    setError(null)
    try {
      const preview = await previewUniversalImport(step.jobId, sheet)
      if (!step.sheetChoice) {
        setStep({ ...step, preview, mapping: preview.mapping })
        return
      }
      // #5223 — la correspondance de la feuille quittée est GARDÉE ; celle de la feuille ouverte est reprise si déjà vue.
      const mappings = {
        ...step.sheetChoice.mappings,
        ...(step.preview.sheet ? { [step.preview.sheet]: step.mapping } : {}),
      }
      setStep({
        ...step,
        preview,
        mapping: mappings[sheet] ?? preview.mapping,
        sheetChoice: { ...step.sheetChoice, mappings },
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('universal.errors.generic'))
    }
  }

  // #5223 — cocher / décocher une feuille ; la correspondance déjà vue d'une feuille décochée n'est pas perdue.
  const toggleSheet = (name: string): void => {
    if (step.kind !== 'mapping' || !step.sheetChoice) return
    const { chosen, mappings } = step.sheetChoice
    setStep({
      ...step,
      sheetChoice: {
        mappings,
        types: step.sheetChoice.types,
        chosen: chosen.includes(name) ? chosen.filter(each => each !== name) : [...chosen, name],
      },
    })
  }

  // #5224 — l'humain corrige le type d'une feuille : sa correction gagne, et choisir un type coche la feuille.
  const changeSheetType = (name: string, type: UniversalImportType): void => {
    if (step.kind !== 'mapping' || !step.sheetChoice) return
    const { chosen, types } = step.sheetChoice
    setStep({
      ...step,
      sheetChoice: {
        ...step.sheetChoice,
        types: { ...types, [name]: type },
        chosen: chosen.includes(name) ? chosen : [...chosen, name],
      },
    })
  }

  const resume = async (jobId: string): Promise<void> => {
    try {
      setStep({ kind: 'running', job: await resumeUniversalImport(jobId) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('universal.errors.generic'))
    }
  }

  const downloadReport = async (jobId: string): Promise<void> => {
    if (!dataExit.grant) {
      setError(t('universal.report.exportRefused'))
      return
    }
    try {
      downloadCSV(await fetchUniversalImportReport(jobId), 'rapport-import.csv', dataExit.grant)
    } catch (caught) {
      setError(workspaceRuleRefusalText(caught) ?? t('universal.errors.generic'))
    }
  }

  const sample = sampleFileFor(type)

  // Théo A comptes-import.N3 — l'entrée « fichier d'exemple » démarre le contrôle d'elle-même, une seule fois.
  const sampleStarted = useRef(false)
  useEffect(() => {
    if (!startWithSample || sampleStarted.current || !sample) return
    sampleStarted.current = true
    void handleFile(sample)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- démarrage unique à l'ouverture
  }, [])

  const page = layout === 'page'
  const stepNumber =
    step.kind === 'mapping' ? 2 : step.kind === 'verification' ? 3 : step.kind === 'running' ? (live ? 3 : 4) : 1
  const wrap = (children: React.ReactNode) =>
    page ? (
      <section aria-labelledby="universal-import-title" className="mx-auto w-full max-w-3xl space-y-4">
        {children}
      </section>
    ) : (
      <ModalPortal>
        {/* Fermer passe par le bouton nommé, jamais par un clic sur le voile : un
          import en cours ne doit pas disparaître sur un clic égaré (et un voile
          cliquable n'est pas tabulable — GA-35). */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="universal-import-title"
            className="mx-4 max-h-[90dvh] w-full max-w-3xl overflow-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
          >
            {children}
          </div>
        </div>
      </ModalPortal>
    )

  return wrap(
    <>
      {page ? (
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--bellum-text-accent)] hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('assistant.back')}
        </button>
      ) : null}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Text
            element={page ? 'h2' : 'h3'}
            id="universal-import-title"
            size={page ? '2xl' : 'base'}
            weight="semibold"
            className="mb-1 text-[var(--bellum-text-primary)]"
          >
            {page ? t(`assistant.titleByType.${type}`) : t('universal.title')}
          </Text>
          <Text element="p" size="sm" className="text-[var(--text-muted)]">
            {page ? t('assistant.subtitle') : t('universal.description')}
          </Text>
        </div>
        {page ? null : (
          <button
            type="button"
            aria-label={t('common:actions.close')}
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--text-ghost)] hover:bg-[var(--bg-surface-hover)]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {page ? <ImportSteps current={stepNumber} /> : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-4 py-3"
        >
          <AlertTriangle className="size-4 shrink-0 text-[var(--warning-soft-text)]" />
          <Text size="sm" className="text-[var(--text-primary)]">
            {error}
          </Text>
        </div>
      ) : null}

      {step.kind === 'choose' ? (
        <div className="space-y-4">
          {fixedType ? null : (
            <div className="flex flex-col gap-1">
              <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
                {t('universal.typeLabel')}
              </Text>
              <SelectField
                ariaLabel={t('universal.typeLabel')}
                value={type}
                onChange={next => setType(next as UniversalImportType)}
                options={UNIVERSAL_IMPORT_TYPES.map(option => ({
                  value: option,
                  label: UNIVERSAL_IMPORT_REGISTRY[option].writable
                    ? t(`universal.types.${option}`)
                    : `${t(`universal.types.${option}`)} — ${t('universal.notWritableYet')}`,
                }))}
              />
            </div>
          )}
          <div role="tablist" aria-label={t('assistant.sourceLabel')} className="flex flex-wrap gap-2">
            {(['file', 'paste'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={source === tab}
                onClick={() => setSource(tab)}
                className={`${CHIP} ${source === tab ? CHIP_ON : CHIP_OFF}`}
              >
                {tab === 'file' ? (
                  <Upload className="size-4" aria-hidden />
                ) : (
                  <ClipboardPaste className="size-4" aria-hidden />
                )}
                {t(`assistant.source.${tab}`)}
              </button>
            ))}
            {/* Théo C4 — les autres sources de la maquette : celles qui ont un écran y mènent ; aucune puce morte. */}
            {page ? (
              <>
                <Link to="/integrations" className={`${CHIP} ${CHIP_OFF}`}>
                  {t('assistant.source.crm')}
                </Link>
                <Link to="/chat" search={{ prompt: t('hub.sources.laura.prompt') }} className={`${CHIP} ${CHIP_OFF}`}>
                  {t('assistant.source.laura')}
                </Link>
              </>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label={t('universal.choose')}
            onChange={event => void handleFile(event.target.files?.[0])}
          />
          {source === 'file' ? (
            <div className="rounded-card border border-[var(--bellum-border)] bg-card p-5">
              <div
                data-testid="import-dropzone"
                onDragOver={event => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => {
                  event.preventDefault()
                  setDragging(false)
                  void handleFile(event.dataTransfer.files?.[0])
                }}
                className={`flex w-full flex-col items-center justify-center gap-3 rounded-control border border-dashed px-4 py-12 text-center ${
                  dragging
                    ? 'border-[var(--bellum-text-accent)] bg-[var(--accent-soft-bg)]'
                    : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]'
                }`}
              >
                <Upload className="size-5 text-[var(--bellum-text-accent)]" aria-hidden />
                <Text element="h3" size="xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
                  {t('assistant.drop.title')}
                </Text>
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('universal.formats')} · {t('universal.sizeLimit', { max: IMPORT_FILE_MAX_LABEL })}
                </Text>
                <Button icon={Upload} className="mt-2 min-h-11" onClick={() => inputRef.current?.click()}>
                  {t('universal.choose')}
                </Button>
              </div>
            </div>
          ) : null}
          {source === 'paste' ? (
            <div className="space-y-2 rounded-card border border-[var(--bellum-border)] bg-card p-5">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-[var(--bellum-text-primary)]">
                  {t('assistant.paste.label')}
                </span>
                <textarea
                  value={pasted}
                  onChange={event => setPasted(event.target.value)}
                  placeholder={t('assistant.paste.placeholder')}
                  className="min-h-40 w-full min-w-0 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2 font-mono text-sm text-[var(--bellum-text-primary)]"
                />
              </label>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('assistant.paste.hint')}
              </Text>
              <Button
                icon={ClipboardPaste}
                className="min-h-11"
                disabled={pasted.trim().length === 0}
                onClick={() =>
                  void handleFile(new File([pasted], 'tableau-colle.tsv', { type: 'text/tab-separated-values' }))
                }
              >
                {t('assistant.paste.check')}
              </Button>
            </div>
          ) : null}
          {sample && source === 'file' ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" size="sm" icon={Download} onClick={() => downloadBlob(sample, sample.name)}>
                {t('universal.downloadSample')}
              </Button>
              <Button variant="ghost" size="sm" icon={FileText} onClick={() => void handleFile(sample)}>
                {t('universal.trySample')}
              </Button>
            </div>
          ) : null}
          <div
            className="flex items-start gap-3 rounded-card border border-[var(--bellum-border)] px-4 py-3"
            data-testid="import-nothing-written"
          >
            <Lock className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('assistant.nothingWritten')}
            </Text>
          </div>
          {scopeChoosable || sourceChoosable ? (
            <section
              className="space-y-4 rounded-card border border-[var(--bellum-border)] bg-card p-5"
              aria-labelledby="import-arrival-title"
            >
              <Text
                element="h3"
                id="import-arrival-title"
                size="base"
                weight="semibold"
                className="text-[var(--bellum-text-primary)]"
              >
                {t('assistant.arrival.title')}
              </Text>
              {scopeChoosable ? (
                <div className="flex flex-col gap-2">
                  <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {t('universal.scope.label')}
                  </Text>
                  <div
                    role="group"
                    aria-label={t('universal.scope.label')}
                    className="inline-grid w-full max-w-sm grid-cols-2 gap-1 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-1"
                  >
                    {(['workspace', 'personal'] as const).map(option => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={scope === option}
                        onClick={() => setScope(option)}
                        className={`min-h-11 rounded-control px-3 text-sm ${
                          scope === option
                            ? 'bg-card font-semibold text-[var(--bellum-text-primary)] shadow-card'
                            : 'text-[var(--bellum-text-secondary)]'
                        }`}
                      >
                        {t(`universal.scope.${option}`)}
                      </button>
                    ))}
                  </div>
                  {scope === 'personal' ? (
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('universal.scope.personalHint')}
                    </Text>
                  ) : null}
                </div>
              ) : null}
              {sourceChoosable ? (
                <div className="flex flex-col gap-1">
                  <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {t('universal.source.label')}
                  </Text>
                  <Input
                    value={sourceSystem}
                    onChange={event => setSourceSystem(event.target.value)}
                    placeholder={t('universal.source.placeholder')}
                    aria-label={t('universal.source.label')}
                    maxLength={80}
                  />
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('universal.source.hint')}
                  </Text>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {step.kind === 'uploading' ? (
        <div className="space-y-2" aria-live="polite">
          <Text size="sm" className="text-[var(--text-primary)]">
            {t('universal.uploading', { sent: step.sent, total: step.total })}
          </Text>
          <progress className="w-full" max={step.total} value={step.sent} />
        </div>
      ) : null}

      {step.kind === 'mapping' ? (
        <MappingStep
          step={step}
          type={type}
          onChange={mapping => setStep({ ...step, mapping })}
          onSheet={sheet => void changeSheet(sheet)}
          onToggleSheet={toggleSheet}
          onSheetType={changeSheetType}
          onLaunch={() => void verify()}
          onCancel={onClose}
        />
      ) : null}

      {/* Théo B c4.R3 — la vérification, sans rien écrire : « Lancer » n'existe qu'avec son rapport en main. */}
      {step.kind === 'verification' ? (
        <div className="space-y-4">
          <ImportVerificationSummary report={step.report} />
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() =>
                setStep({
                  kind: 'mapping',
                  jobId: step.jobId,
                  preview: step.preview,
                  mapping: step.mapping,
                  fileName: step.fileName,
                  ...(step.sheetChoice ? { sheetChoice: step.sheetChoice } : {}),
                })
              }
            >
              {t('universal.mapping.backToMapping')}
            </Button>
            <Button icon={Upload} className="min-h-11" onClick={() => void launch()}>
              {t('universal.mapping.launch')}
            </Button>
          </div>
        </div>
      ) : null}

      {step.kind === 'running' ? (
        <div className="space-y-4" aria-live="polite">
          {live ? (
            <div className="space-y-2">
              <Text size="sm" className="text-[var(--text-primary)]">
                {t('universal.running', { count: step.job.processedRows })}
              </Text>
              {/* Le total n'est connu qu'à la fin de la lecture : barre indéterminée, jamais un « 0 % » inventé. */}
              <progress className="w-full" />
              <Text size="xs" className="text-[var(--text-muted)]">
                {t('universal.canClose')}
              </Text>
            </div>
          ) : null}
          {step.job.status === 'done' || step.job.status === 'failed' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {step.job.status === 'done' ? (
                  <CheckCircle2 className="size-4 text-[var(--success-soft-text)]" />
                ) : (
                  <AlertTriangle className="size-4 text-[var(--warning-soft-text)]" />
                )}
                <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
                  {step.job.status === 'done'
                    ? t('universal.report.done', { count: step.job.totalRows ?? step.job.processedRows })
                    : t('universal.report.interrupted', { count: step.job.processedRows })}
                </Text>
              </div>
              {page && step.job.status === 'done' ? <ResultTiles job={step.job} /> : null}
              <ImportReport job={step.job} />
              {step.job.sheets ? <ImportSheetsReport sheets={step.job.sheets} /> : null}
              <div className="flex flex-wrap gap-3">
                {page && step.job.status === 'done' && step.job.type === 'contact' && step.job.imported > 0 ? (
                  <Button asChild className="min-h-11">
                    <Link to="/contacts">{t('assistant.result.openDirectory')}</Link>
                  </Button>
                ) : null}
                {step.job.duplicates + step.job.rejected + step.job.toReconcile > 0 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    onClick={() => void downloadReport(step.job.id)}
                  >
                    {t('universal.report.download')}
                  </Button>
                ) : null}
                {/* #AM.9 — les sociétés « à valider » d'un fichier contacts se valident d'un clic. */}
                {step.job.status === 'done' && step.job.scope !== 'personal' && step.job.toReconcile > 0 ? (
                  <ValidateCompaniesButton jobId={step.job.id} />
                ) : null}
                {step.job.status === 'failed' ? (
                  <Button variant="black" size="sm" onClick={() => void resume(step.job.id)}>
                    {t('universal.report.resume')}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={onClose}>
                  {t('universal.report.close')}
                </Button>
              </div>
              {step.job.status === 'done' ? renderAfterReport?.(step.job) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>,
  )
}

/**
 * Théo C4 — l'étape « Résultat » : les trois nombres en grand (créés · à revoir · non importés). Un nombre nul ne fait
 * pas de tuile — une absence n'est jamais un « 0 » affiché ; le bilan par famille, dessous, garde le détail.
 */
function ResultTiles({ job }: { job: UniversalImportJobState }) {
  const { t } = useTranslation('importWizard')
  const tiles = [
    { id: 'created', count: job.imported },
    { id: 'review', count: job.duplicates + job.toReconcile },
    { id: 'rejected', count: job.rejected },
  ].filter(tile => tile.count > 0)
  if (tiles.length === 0) return null
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3" data-testid="import-result-tiles">
      {tiles.map(tile => (
        <div key={tile.id} className="rounded-card border border-[var(--bellum-border)] bg-card p-4">
          <dd className="text-3xl font-semibold text-[var(--bellum-text-primary)]">
            {tile.count.toLocaleString('fr-FR')}
          </dd>
          <dt className="text-sm text-[var(--bellum-text-secondary)]">
            {t(`assistant.result.${tile.id}`, { count: tile.count })}
          </dt>
        </div>
      ))}
    </dl>
  )
}

/**
 * #4051.1 — LE BILAN d'un lot, PAR FAMILLE (le composant partagé avec l'assistant de reprise, #4051 :
 * un seul bilan pour les deux chemins). Un job d'avant le bilan par famille (`breakdown` vide) garde
 * ses trois compteurs globaux.
 */
function ImportReport({ job }: { job: UniversalImportJobState }) {
  const { t } = useTranslation('importWizard')
  if (!hasFamilyReport(job.breakdown)) {
    return (
      <ul className="space-y-1">
        <li>
          <Text size="sm">{t('universal.report.imported', { count: job.imported })}</Text>
        </li>
        {job.duplicates > 0 ? (
          <li>
            <Text size="sm">{t('universal.report.duplicates', { count: job.duplicates })}</Text>
          </li>
        ) : null}
        {job.rejected > 0 ? (
          <li>
            <Text size="sm">{t('universal.report.rejected', { count: job.rejected })}</Text>
          </li>
        ) : null}
      </ul>
    )
  }
  return <ImportFamilyReport breakdown={job.breakdown} queryableByLaura={job.queryableByLaura} />
}

/** #5223 — les feuilles cochées, chacune avec sa correspondance, dans l'ordre du classeur. */
function sheetsOf(choice: SheetChoice): UniversalImportSheetPlan[] {
  return choice.chosen.flatMap(name => {
    const mapping = choice.mappings[name]
    const type = choice.types[name]
    return mapping ? [{ name, mapping, ...(type ? { type } : {}) }] : []
  })
}

/** L'écran de correspondance : chaque colonne → un champ du type, ou « conserver en informations complémentaires ». */
function MappingStep({
  step,
  type,
  onChange,
  onLaunch,
  onSheet,
  onToggleSheet,
  onSheetType,
  onCancel,
}: {
  step: Extract<Step, { kind: 'mapping' }>
  type: UniversalImportType
  onChange: (mapping: UniversalImportMapping) => void
  onSheet: (sheet: string) => void
  onToggleSheet: (sheet: string) => void
  onSheetType: (sheet: string, type: UniversalImportType) => void
  onLaunch: () => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation('importWizard')
  const { preview, mapping } = step
  // #2732.1 — le champ se nomme dans le vocabulaire du TYPE importé (« Intitulé de la mission », « Client » pour une
  // mission — pas « Poste / intitulé », « Société » des contacts) ; à défaut, le libellé générique.
  const fieldLabel = (field: string): string =>
    i18n.exists(`importWizard:universal.fieldsByType.${type}.${field}`)
      ? t(`universal.fieldsByType.${type}.${field}`)
      : t(`universal.fields.${field}`, { defaultValue: field })
  const used = new Set(Object.values(mapping).filter(Boolean))
  const missing = UNIVERSAL_IMPORT_REGISTRY[type].fields.filter(field => field.required && !used.has(field.key))
  // Un contact se nomme aussi par prénom + nom : le champ obligatoire est alors composé.
  const nameComposed = (type === 'contact' || type === 'talent') && used.has('first_name') && used.has('last_name')
  const blocking = missing.filter(field => !(field.key === 'full_name' && nameComposed))

  const rows = preview.sheets?.find(sheet => sheet.name === preview.sheet)?.rows ?? null

  return (
    <div className="space-y-4">
      {/* Théo C4 — `.v13-mini-summary` : le fichier lu, sa taille, l'onglet, et la promesse « aucune fiche modifiée ». */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-[var(--bellum-border)] bg-card px-4 py-3"
        data-testid="import-mapping-summary"
      >
        <span className="min-w-0">
          <span className="block break-all text-sm font-semibold text-[var(--bellum-text-primary)]">
            {step.fileName}
          </span>
          <span className="block text-xs text-[var(--bellum-text-muted)]">
            {rows !== null
              ? t('assistant.summary.rowsColumns', { rows, columns: preview.headers.length })
              : t('assistant.summary.columns', { count: preview.headers.length })}
          </span>
        </span>
        {preview.sheets && preview.sheets.length > 1 ? (
          <span className="flex min-w-48 items-center gap-2">
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('universal.sheet.label')}
            </Text>
            <SelectField
              ariaLabel={t('universal.sheet.label')}
              value={preview.sheet ?? ''}
              onChange={next => onSheet(next)}
              options={preview.sheets.map(sheet => ({
                value: sheet.name,
                label: t('universal.sheet.option', { name: sheet.name, count: sheet.rows }),
              }))}
            />
          </span>
        ) : null}
        <span className="grow" />
        <span className="rounded-badge bg-[var(--accent-soft-bg)] px-2 py-0.5 text-xs font-medium text-[var(--accent-soft-text)]">
          {t('assistant.summary.nothingChanged')}
        </span>
      </div>
      {preview.sheets && step.sheetChoice ? (
        <SheetChoiceList
          sheets={preview.sheets}
          chosen={step.sheetChoice.chosen}
          types={step.sheetChoice.types}
          onToggle={onToggleSheet}
          onType={onSheetType}
        />
      ) : preview.sheets && preview.sheets.length > 1 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('universal.sheet.help')}
        </Text>
      ) : null}

      <section
        className="space-y-1 rounded-card border border-[var(--bellum-border)] bg-card p-5"
        aria-labelledby="import-mapping-title"
      >
        <Text
          element="h3"
          id="import-mapping-title"
          size="base"
          weight="semibold"
          className="text-[var(--bellum-text-primary)]"
        >
          {t('assistant.mapping.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('universal.mapping.help')}
        </Text>
        <ul className="mt-3 divide-y divide-[var(--bellum-border)]" data-testid="import-mapping-rows">
          {preview.headers.map(header => (
            <li key={header} className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] items-center gap-2 py-3">
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold text-[var(--bellum-text-primary)]">
                  {header}
                </span>
                <span className="block truncate text-xs text-[var(--bellum-text-muted)]">
                  {preview.sample.find(row => row[header]?.trim())?.[header] ?? t('assistant.mapping.emptySample')}
                </span>
              </span>
              <SelectField
                ariaLabel={t('universal.mapping.fieldFor', { column: header })}
                value={mapping[header] ?? ''}
                onChange={next => onChange({ ...mapping, [header]: next || null })}
                emptyOption={{ label: t('universal.mapping.keepExtra') }}
                options={preview.fields.map(field => ({
                  value: field,
                  label: fieldLabel(field),
                  // Un champ déjà pris par une autre colonne : deux colonnes ne s'écrasent jamais.
                  disabled: used.has(field) && mapping[header] !== field,
                }))}
              />
            </li>
          ))}
        </ul>
      </section>
      {/* Un AVERTISSEMENT, pas un verrou : Bellum ne bloque jamais — les lignes
          sans ce champ partiront au rapport, nommées, et le reste s'importe. */}
      {blocking.length > 0 ? (
        <Text size="sm" className="text-[var(--warning-soft-text)]">
          {t('universal.mapping.missing', {
            fields: blocking.map(field => fieldLabel(field.key)).join(', '),
          })}
        </Text>
      ) : null}
      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" className="min-h-11" onClick={onCancel}>
          {t('common:actions.cancel')}
        </Button>
        <Button
          icon={Upload}
          className="min-h-11"
          onClick={onLaunch}
          disabled={step.checking === true || (step.sheetChoice?.chosen.length ?? 1) === 0}
        >
          {step.checking ? t('universal.mapping.verifying') : t('universal.mapping.verify')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Théo B C4 — les QUATRE étapes de l'assistant : Source · Colonnes · Vérification · Résultat. Le serveur exécute déjà
 * la normalisation, le dédoublonnage et la simulation ensemble : ils tiennent dans « Vérification ».
 */
function ImportSteps({ current }: { current: number }) {
  const { t } = useTranslation('importWizard')
  const keys = ['source', 'columns', 'check', 'result'] as const
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label={t('assistant.steps.label')}>
      {keys.map((key, index) => {
        const number = index + 1
        const state = number < current ? 'done' : number === current ? 'current' : 'todo'
        return (
          <li
            key={key}
            aria-current={state === 'current' ? 'step' : undefined}
            data-state={state}
            className="flex min-h-11 items-center gap-2 text-sm"
          >
            <span
              aria-hidden
              className={`flex size-7 items-center justify-center rounded-control border text-xs font-semibold ${
                state === 'current'
                  ? 'border-[var(--bellum-text-accent)] text-[var(--bellum-text-primary)]'
                  : state === 'done'
                    ? 'border-transparent bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]'
                    : 'border-[var(--bellum-border)] text-[var(--bellum-text-muted)]'
              }`}
            >
              {state === 'done' ? '✓' : number}
            </span>
            <span
              className={
                state === 'current'
                  ? 'font-semibold text-[var(--bellum-text-primary)]'
                  : 'text-[var(--bellum-text-secondary)]'
              }
            >
              {t(`assistant.steps.${key}`)}
            </span>
            {number < keys.length ? (
              <span aria-hidden className="ml-1 hidden h-px w-16 bg-[var(--bellum-border)] sm:block" />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
