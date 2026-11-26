import type { MailMessage, MailThread } from '@bellum/contracts'

/**
 * #4016 L13c — « ENVOYÉ » DÉTECTÉ DANS LA BOÎTE comme vraie preuve d'envoi
 * (DÉCISION LOUIS 11/10/2026, renverse en partie #2060 / c35 « Fait ne porte
 * jamais de preuve d'envoi »).
 *
 * ⚠️ CE QUI RESTE VRAI : « Fait » est un geste DÉCLARATIF, il ne devient jamais
 * une preuve (`completion_mode: 'manual'`). La preuve vient d'ailleurs : un
 * message SORTANT présent dans la boîte de l'utilisateur lui-même, vers un
 * contact résolu avec certitude. Deux faits, deux modes — jamais confondus.
 *
 * Ne lit que des MÉTADONNÉES (direction, date) : jamais le corps.
 */
type SentProof = { contactId: string; threadId: string; sentAt: Date }

export function latestSentProofByThread(
  threads: readonly Pick<MailThread, 'threadId' | 'contactId'>[],
  messages: readonly MailMessage[],
): SentProof[] {
  const proofs: SentProof[] = []
  for (const thread of threads) {
    if (!thread.contactId) continue
    let latest: Date | null = null
    for (const message of messages) {
      if (message.threadId !== thread.threadId || message.direction !== 'outbound' || !message.date) continue
      const sentAt = new Date(message.date)
      if (Number.isNaN(sentAt.getTime())) continue
      if (!latest || sentAt > latest) latest = sentAt
    }
    if (latest) proofs.push({ contactId: thread.contactId, threadId: thread.threadId, sentAt: latest })
  }
  return proofs
}
