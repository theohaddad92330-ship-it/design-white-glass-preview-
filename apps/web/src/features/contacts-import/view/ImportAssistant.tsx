import type {
  UniversalImportJobState,
  UniversalImportMapping,
  UniversalImportPreview,
  UniversalImportScope,
  UniversalImportVerification,
} from '@bellum/contracts'
import { IMPORT_FILE_MAX_LABEL, exceedsImportLimit, universalImportFormatOf } from '@bellum/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  fetchUniversalImport,
  fetchUniversalImportReport,
  previewUniversalImport,
  resumeUniversalImport,
  startUniversalImport,
  uploadUniversalImport,
  verifyUniversalImport,
} from '@/features/universal-import/api'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { subscribeToImportJob } from '@/lib/socket'
import type { ImportSourceKey } from '../model/sources'
import { ColumnsStep } from './ColumnsStep'
import { ImportStepper, type AssistantStep } from './ImportStepper'
import { ResultStep } from './ResultStep'
import { SourceStep } from './SourceStep'
import { VerificationStep } from './VerificationStep'

type Stage =
  | { kind: 'source' }
  | { kind: 'uploading'; sent: number; total: number }
  | {
      kind: 'columns'
      jobId: string
      filename: string
      preview: UniversalImportPreview
      mapping: UniversalImportMapping
    }
  | {
      kind: 'verification'
      jobId: string
      filename: string
      preview: UniversalImportPreview
      mapping: UniversalImportMapping
      report: UniversalImportVerification
    }
  | { kind: 'result'; job: UniversalImportJobState; report: UniversalImportVerification | null }

const STEP_OF: Record<Stage['kind'], AssistantStep> = {
  source: 'source',
  uploading: 'source',
  columns: 'columns',
  verification: 'verification',
  result: 'result',
}

/** Un job encore en cours relit son état toutes les… — le filet sous Socket.IO, jamais une barre figée. */
const POLL_MS = 2_000

/**
 * Théo B c4-assistant-import — l'assistant d'import de contacts : Source → Colonnes → Vérification → Résultat.
 *
 * LA RÈGLE (Louis 22/10) : un import est TOUJOURS vérifié avant d'être lancé, quelle que soit la taille du fichier.
 * L'écran n'offre « Importer » qu'avec le rapport de vérification en main ; un fichier long part ensuite en
 * arrière-plan (on peut fermer la fenêtre). Le fichier est envoyé par parts au stockage ; rien n'est écrit dans le
 * répertoire avant la confirmation.
 */
export function ImportAssistant({ source: initialSource }: { source: ImportSourceKey }) {
  const { t } = useTranslation('importWizard')
  const queryClient = useQueryClient()
  const dataExit = useDataExit()
  const [source, setSource] = useState<ImportSourceKey>(initialSource)
  const [stage, setStage] = useState<Stage>({ kind: 'source' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scope, setScope] = useState<UniversalImportScope>('workspace')
  const [sourceSystem, setSourceSystem] = useState('')
  const [declined, setDeclined] = useState<ReadonlySet<number>>(new Set())
  const [confirmed, setConfirmed] = useState(false)
  const notified = useRef(false)

  const arrival = { scope, sourceSystem: sourceSystem.trim() || null }

  // Temps réel + filet HTTP pendant l'écriture : les deux écrivent le même état, le plus récent gagne.
  const resultJob = stage.kind === 'result' ? stage.job : null
  const live = resultJob?.status === 'queued' || resultJob?.status === 'processing'
  const resultId = resultJob?.id ?? null
  useEffect(() => {
    if (!resultId || !live) return
    const apply = (job: UniversalImportJobState) =>
      setStage(current => (current.kind === 'result' ? { ...current, job } : current))
    const unsubscribe = subscribeToImportJob(resultId, apply)
    const timer = setInterval(() => {
      fetchUniversalImport(resultId).then(apply, () => undefined)
    }, POLL_MS)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [resultId, live])

  const finished = resultJob?.status === 'done'
  useEffect(() => {
    if (!finished) return
    // Les listes qui montrent ce qui vient d'être créé se relisent ; l'historique aussi.
    void queryClient.invalidateQueries({ queryKey: ['contacts'] })
    void queryClient.invalidateQueries({ queryKey: ['personal-contacts'] })
    void queryClient.invalidateQueries({ queryKey: ['universal-import', 'history'] })
    if (!notified.current) {
      notified.current = true
      toast.success(t('contactsImport.assistant.result.toast'))
    }
  }, [finished, queryClient, t])

  const fail = (caught: unknown) =>
    setError(caught instanceof Error && caught.message ? caught.message : t('contactsImport.assistant.error'))

  const handleFile = async (file: File): Promise<void> => {
    setError(null)
    if (!universalImportFormatOf(file.name)) {
      setError(t('universal.errors.format'))
      return
    }
    if (exceedsImportLimit(file.size)) {
      setError(
        t('universal.errors.tooLarge', { sizeMb: Math.round(file.size / (1024 * 1024)), max: IMPORT_FILE_MAX_LABEL }),
      )
      return
    }
    try {
      setStage({ kind: 'uploading', sent: 0, total: 1 })
      const job = await uploadUniversalImport(file, 'contact', null, (sent, total) =>
        setStage({ kind: 'uploading', sent, total }),
      )
      const preview = await previewUniversalImport(job.id)
      setStage({ kind: 'columns', jobId: job.id, filename: file.name, preview, mapping: preview.mapping })
    } catch (caught) {
      fail(caught)
      setStage({ kind: 'source' })
    }
  }

  const changeSheet = async (sheet: string): Promise<void> => {
    if (stage.kind !== 'columns') return
    setError(null)
    try {
      const preview = await previewUniversalImport(stage.jobId, sheet)
      setStage({ ...stage, preview, mapping: preview.mapping })
    } catch (caught) {
      fail(caught)
    }
  }

  const verify = async (): Promise<void> => {
    if (stage.kind !== 'columns') return
    setError(null)
    setBusy(true)
    try {
      const report = await verifyUniversalImport(stage.jobId, stage.mapping, stage.preview.sheet ?? null, arrival)
      setDeclined(new Set())
      setConfirmed(false)
      setStage({ ...stage, kind: 'verification', report })
    } catch (caught) {
      fail(caught)
    } finally {
      setBusy(false)
    }
  }

  const launch = async (): Promise<void> => {
    if (stage.kind !== 'verification') return
    setError(null)
    setBusy(true)
    try {
      const job = await startUniversalImport(stage.jobId, stage.mapping, stage.preview.sheet ?? null, {
        skipLines: [...declined].sort((a, b) => a - b),
        ...arrival,
      })
      setStage({ kind: 'result', job, report: stage.report })
    } catch (caught) {
      fail(caught)
    } finally {
      setBusy(false)
    }
  }

  const download = async (): Promise<void> => {
    if (stage.kind !== 'result') return
    if (!dataExit.grant) {
      setError(t('universal.report.exportRefused'))
      return
    }
    try {
      downloadCSV(await fetchUniversalImportReport(stage.job.id), 'rapport-import.csv', dataExit.grant)
    } catch (caught) {
      setError(workspaceRuleRefusalText(caught) ?? t('contactsImport.assistant.error'))
    }
  }

  const resume = async (): Promise<void> => {
    if (stage.kind !== 'result') return
    try {
      setStage({ ...stage, job: await resumeUniversalImport(stage.job.id) })
    } catch (caught) {
      fail(caught)
    }
  }

  return (
    <div data-testid="import-assistant">
      <ImportStepper current={STEP_OF[stage.kind]} />
      {stage.kind === 'source' ? (
        <SourceStep source={source} onSource={setSource} onFile={file => void handleFile(file)} error={error} />
      ) : null}
      {stage.kind === 'uploading' ? (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-[var(--text-primary)]">
            {t('contactsImport.assistant.uploading', { sent: stage.sent, total: stage.total })}
          </p>
          <progress className="w-full" max={stage.total} value={stage.sent} />
        </div>
      ) : null}
      {stage.kind === 'columns' ? (
        <ColumnsStep
          filename={stage.filename}
          preview={stage.preview}
          mapping={stage.mapping}
          onMapping={mapping => setStage({ ...stage, mapping })}
          onSheet={sheet => void changeSheet(sheet)}
          scope={scope}
          onScope={setScope}
          sourceSystem={sourceSystem}
          onSourceSystem={setSourceSystem}
          verifying={busy}
          error={error}
          onBack={() => {
            setError(null)
            setStage({ kind: 'source' })
          }}
          onVerify={() => void verify()}
        />
      ) : null}
      {stage.kind === 'verification' ? (
        <VerificationStep
          report={stage.report}
          declined={declined}
          onDecision={(line, skip) =>
            setDeclined(current => {
              const next = new Set(current)
              if (skip) next.add(line)
              else next.delete(line)
              return next
            })
          }
          confirmed={confirmed}
          onConfirmed={setConfirmed}
          importing={busy}
          error={error}
          onBack={() => {
            setError(null)
            setStage({ ...stage, kind: 'columns' })
          }}
          onImport={() => void launch()}
        />
      ) : null}
      {stage.kind === 'result' ? (
        <ResultStep
          job={stage.job}
          notImported={stage.report?.rows ?? []}
          declined={declined}
          onDownload={() => void download()}
          onResume={() => void resume()}
          error={error}
        />
      ) : null}
    </div>
  )
}
