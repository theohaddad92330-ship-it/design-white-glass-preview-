import { useEffect, useRef, useState } from 'react'
import { Button } from '@bellum/ui'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDataExit } from '@/lib/data-exit'
import { downloadDocument } from '@/features/documents/api'
import { useBulkExportEnqueue, useBulkExportJobStatus } from '../hooks'

/**
 * #1952.6 (épopée #2844) — l'export en lot du vivier ENTIER, en tâche de
 * fond, SANS le plafond `ATS_EXPORT_MAX_ROWS` de `AtsExportButton` (voisin,
 * synchrone). Le moteur (`bulk-export.{queue,service,worker,controller}.ts`)
 * était livré et testé depuis le lot SRC5 (28/09 soir) — cette page était le
 * seul appelant qui manquait : « du code juste, calculé, testé, que
 * personne n'appelle » (CLAUDE.md, § Ce qui est déjà livré).
 *
 * Poll, jamais une supposition sur la durée (même patron que
 * `CvZipImportDialog`) : le job dit lui-même quand il est `done`/`failed`.
 */
export function BulkExportButton() {
  const { t } = useTranslation('consultants')
  const dataExit = useDataExit()
  const enqueue = useBulkExportEnqueue()
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useBulkExportJobStatus(jobId)
  // Un téléchargement par job — sans cette garde, une relecture qui rend le
  // MÊME état `done` (poll arrêté, mais React peut re-rendre) relancerait le
  // téléchargement.
  const downloadedFor = useRef<string | null>(null)

  const run = async () => {
    if (!dataExit.grant || enqueue.isPending || job.data?.status === 'queued' || job.data?.status === 'processing')
      return
    try {
      const started = await enqueue.mutateAsync()
      setJobId(started.id)
    } catch {
      toast.error(t('bulkExport.failed'))
    }
  }

  useEffect(() => {
    if (!jobId || !job.data) return
    if (job.data.status === 'done' && downloadedFor.current !== jobId) {
      downloadedFor.current = jobId
      if (job.data.rowCount === 0) {
        toast.info(t('bulkExport.empty'))
        return
      }
      // `truncated` n'est vrai que quand `rowCount` est un nombre RÉEL
      // (`bulk-export.service.ts::toView`) — jamais de repli `?? 0` sur une
      // valeur affichée (garde GA-19).
      if (job.data.truncated && job.data.rowCount !== null)
        toast.warning(t('bulkExport.truncated', { max: job.data.rowCount }))
      void downloadDocument(`/talents/export/bulk/${jobId}/download`, `vivier-${jobId}.csv`).catch(() =>
        toast.error(t('bulkExport.failed')),
      )
    } else if (job.data.status === 'failed' && downloadedFor.current !== jobId) {
      downloadedFor.current = jobId
      toast.error(t('bulkExport.failed'))
    }
  }, [jobId, job.data, t])

  if (!dataExit.allowed) return null

  const running = enqueue.isPending || job.data?.status === 'queued' || job.data?.status === 'processing'

  return (
    <Button variant="outline" size="sm" icon={Download} disabled={running} onClick={() => void run()}>
      {running ? t('bulkExport.working') : t('bulkExport.cta')}
    </Button>
  )
}
