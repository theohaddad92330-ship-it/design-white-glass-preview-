import { useEffect, useRef } from 'react'
import { Button } from '@bellum/ui'
import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-error'
import { useBulkCvRewriteEnqueue, useBulkCvRewriteJobStatus } from '../hooks'

/**
 * #1952.5 (épopée #2844) — la réécriture de CV en lot devient CLIQUABLE,
 * même patron que `BulkExportButton` (#1952.6) : le moteur existait, testé,
 * sans appelant web (« du code juste, calculé, testé, que personne
 * n'appelle », CLAUDE.md). Monté à côté de la comparaison de profils
 * (`ConsultantMatchPanel`) : `compareIds` EST déjà la sélection 1 à 4
 * consultants du même besoin — aucune seconde case à cocher (GA-26).
 *
 * Poll, jamais une supposition sur la durée — le job dit lui-même quand il
 * est `done`/`failed` (même patron que `BulkExportButton`).
 */
export function BulkCvRewriteButton({
  opportunityId,
  consultantIds,
}: {
  opportunityId: string
  consultantIds: readonly string[]
}) {
  const { t } = useTranslation('consultants')
  const enqueue = useBulkCvRewriteEnqueue()
  const jobId = enqueue.data?.id ?? null
  const job = useBulkCvRewriteJobStatus(jobId)
  // Un rapport par job — sans cette garde, une relecture qui rend le MÊME
  // état `done` (poll arrêté, mais React peut re-rendre) redirait le rapport.
  const reportedFor = useRef<string | null>(null)

  const run = async () => {
    if (enqueue.isPending || job.data?.status === 'queued' || job.data?.status === 'processing') return
    try {
      await enqueue.mutateAsync({ opportunityId, consultantIds })
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error(t('match.bulkCvRewriteOutOfCredits'))
        return
      }
      toast.error(t('match.bulkCvRewriteFailed'))
    }
  }

  useEffect(() => {
    if (!jobId || !job.data || reportedFor.current === jobId) return
    if (job.data.status === 'done') {
      reportedFor.current = jobId
      const done = job.data.results.filter(result => result.status === 'done').length
      const failed = job.data.results.length - done
      if (failed === 0) toast.success(t('match.bulkCvRewriteDone', { count: done }))
      else toast.warning(t('match.bulkCvRewritePartial', { done, failed }))
    } else if (job.data.status === 'failed') {
      reportedFor.current = jobId
      toast.error(t('match.bulkCvRewriteFailed'))
    }
  }, [jobId, job.data, t])

  const running = enqueue.isPending || job.data?.status === 'queued' || job.data?.status === 'processing'

  return (
    <Button variant="outline" size="sm" icon={FileText} disabled={running} onClick={() => void run()}>
      {running ? t('match.bulkCvRewriteWorking') : t('match.bulkCvRewriteCta', { count: consultantIds.length })}
    </Button>
  )
}
