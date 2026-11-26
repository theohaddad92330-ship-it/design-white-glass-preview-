import { apiFetch } from '@/lib/api'

/**
 * #3862.1 (lot X04, 08/10) — ce que l'écran relit après un rechargement de page
 * ou une reconnexion, pour une étude Approfondie interrompue faute de budget.
 *
 * `ChatDeepenJobsController.latest` (`GET /chat/deepen-jobs/latest`) existait déjà,
 * appelé par l'IA à l'écriture (`chat_deepen_job_report.py`) depuis #3236.2 — mais
 * aucun écran web ne le relisait : l'« écran de progression » que son propre
 * commentaire annonçait (`chat-deepen-jobs.service.ts:31`) n'existait pas. Voir
 * `DeepenJobResumeBanner`.
 *
 * `undefined` : aucune ligne (pas d'étude interrompue sur ce fil) — PAS `null`.
 * NestJS sérialise un contrôleur qui rend `null` en corps VIDE sur un 200, et
 * `apiFetch` rend alors `undefined` (voir `lib/api.ts`, #1608/#1640.3). Un
 * appelant qui attendrait `null` ne verrait jamais sa branche s'exécuter.
 */
type ChatDeepenJobStatus = 'queued' | 'running' | 'done' | 'unknown'

export interface ChatDeepenJobStatusDto {
  id: string
  status: ChatDeepenJobStatus
  label: string
  completedSteps: number
  currentStep: string | null
  /** #3236 (lot W2) — reprises faites en fond, et la raison NOMMÉE de l'arrêt (`null` tant que ça court). */
  autoResumes: number
  stoppedReason: 'credit_ceiling' | 'max_resumes' | 'resume_failed' | null
  updatedAt: string
}

export const chatDeepenJobApi = {
  latest(conversationId: string): Promise<ChatDeepenJobStatusDto | undefined> {
    return apiFetch<ChatDeepenJobStatusDto | undefined>({
      path: `/chat/deepen-jobs/latest?conversationId=${encodeURIComponent(conversationId)}`,
    })
  },
}
