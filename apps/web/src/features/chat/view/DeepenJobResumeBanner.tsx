import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { InfoBanner } from '@bellum/ui'
import { chatDeepenJobApi, type ChatDeepenJobStatusDto } from '../api/chatDeepenJobApi'

/**
 * #3862.1 (lot X04, 08/10) — une étude Approfondie interrompue faute de budget
 * (`chat_orchestrator.py:1978`/`:1988`, `thread.note_unfinished_work` +
 * `chat_deepen_job_report.report_interrupted`) le RESTE pour la personne tant
 * qu'elle n'a pas continué : elle quittait l'écran, revenait, et ne retrouvait
 * QUE la dernière bulle — rien ne disait qu'un travail était encore en
 * suspens si elle avait fait défiler plus haut depuis.
 *
 * `GET /chat/deepen-jobs/latest` existait déjà, écrit par l'IA depuis #3236.2,
 * jamais relu par aucun écran web (`git grep deepen-jobs/latest` : zéro
 * résultat hors `apps/api`/`apps/ia` avant ce lot) — exactement le motif que
 * CLAUDE.md nomme : du code juste, calculé, testé, que personne n'appelait.
 *
 * Statuts NON terminaux seulement (`queued`/`running`, même liste que
 * `ChatDeepenJobsService.NON_TERMINAL_STATUSES`) : `done` (jamais écrit
 * aujourd'hui) et `unknown` (reprise arrêtée par le ramasseur de jobs
 * bloqués, doctrine « un timeout n'est pas un échec ») ne proposent rien.
 *
 * #3862.1 (lot I02) — la limite du lot X04 est levée : un tour Approfondi qui
 * va au bout referme la ligne (`chat_orchestrator.py` →
 * `chat_deepen_job_report.report_resolved` → `POST /internal/chat/deepen-jobs/resolve`,
 * statut `done`), donc le bandeau ne revient plus après un rechargement.
 * Le repli sur le nombre de messages reste utile pendant l'attente de ce signal.
 */

const RESUMABLE_STATUSES: readonly ChatDeepenJobStatusDto['status'][] = ['queued', 'running']

// #3236 (lot W2) — l'étude reprend seule en fond ; quand cette reprise s'ARRÊTE, la raison est nommée
// (la ligne passe `unknown`, jamais `failed`) et le bandeau la dit au lieu de disparaître en silence.
const STOP_KEYS = {
  credit_ceiling: 'deepenJob.stopped.creditCeiling',
  max_resumes: 'deepenJob.stopped.maxResumes',
  resume_failed: 'deepenJob.stopped.resumeFailed',
} as const

export function DeepenJobResumeBanner({
  conversationId,
  messageCount,
}: {
  conversationId: string | null
  messageCount: number
}) {
  const { t } = useTranslation('chat')
  const [job, setJob] = useState<ChatDeepenJobStatusDto | null>(null)
  const messageCountAtLoad = useRef<number | null>(null)

  useEffect(() => {
    setJob(null)
    messageCountAtLoad.current = null
    if (!conversationId) return
    let cancelled = false
    // #3862.1 — `Promise.resolve().then(...)` plutôt qu'un appel direct : un
    // test qui `vi.resetAllMocks()` le mock GLOBAL de `apiFetch` (plusieurs le
    // font, voir `Chat.stop.test.tsx`) sans reconfigurer `chatDeepenJobApi` lui
    // rend `undefined` plutôt qu'une promesse — `.then` sur `undefined` plante
    // SYNCHRONEMENT dans l'effet. Cette enveloppe absorbe aussi bien une
    // valeur non-promesse qu'un rejet, sans exiger qu'aucun fichier de test de
    // `Chat` ne reconfigure un mock pour un appel qu'il ne teste pas.
    Promise.resolve()
      .then(() => chatDeepenJobApi.latest(conversationId))
      .then(result => {
        if (cancelled) return
        if (result && (RESUMABLE_STATUSES.includes(result.status) || result.stoppedReason)) {
          messageCountAtLoad.current = messageCount
          setJob(result)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // #3862.1 — dépend du FIL, pas de `messageCount` : relire à chaque message
    // enverrait un appel par token streamé (le fil grossit à chaque fragment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  if (!job) return null
  // Un message de plus depuis la lecture du job : la personne a déjà continué
  // dans CETTE session — voir la limite assumée dans le docstring du module.
  if (messageCountAtLoad.current !== null && messageCount > messageCountAtLoad.current) return null

  if (job.stoppedReason) {
    return (
      <InfoBanner icon={RotateCcw} size="sm" className="mb-2">
        {t(STOP_KEYS[job.stoppedReason], { label: job.label, count: job.autoResumes })}
      </InfoBanner>
    )
  }

  return (
    <InfoBanner icon={RotateCcw} size="sm" className="mb-2">
      {job.completedSteps > 0
        ? t('deepenJob.resumeBanner.withSteps', { label: job.label, count: job.completedSteps })
        : t('deepenJob.resumeBanner.default', { label: job.label })}
    </InfoBanner>
  )
}
