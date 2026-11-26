import type { CreateReplyFeedback, ReplyFeedbackAck, ReplyFeedbackItem } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #1919 — les retours d'une personne sur les réponses de Laura
 * (`/reply-feedback`, cloisonné espace + auteur côté API).
 *
 * Aucun texte de réponse ne part d'ici : le corps porte l'EMPREINTE
 * (`replyDigest`), jamais la réponse recopiée (#1919.14).
 */
export function sendReplyFeedback(body: CreateReplyFeedback): Promise<ReplyFeedbackAck> {
  return apiFetch<ReplyFeedbackAck, CreateReplyFeedback>({ path: '/reply-feedback', method: 'POST', body })
}

export async function listMyReplyFeedback(): Promise<ReplyFeedbackItem[]> {
  const response = await apiFetch<{ items: ReplyFeedbackItem[] }>({ path: '/reply-feedback/mine' })
  // Réponse inattendue → liste vide, jamais `undefined` (règle du dépôt sur les
  // données distantes).
  return response?.items ?? []
}

export async function withdrawReplyFeedback(id: string): Promise<void> {
  await apiFetch<{ withdrawn: true }>({ path: `/reply-feedback/${id}/withdraw`, method: 'POST' })
}
