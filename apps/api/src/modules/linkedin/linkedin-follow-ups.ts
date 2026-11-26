import type { LinkedInFollowUp, LinkedInInteractionKind } from '@bellum/contracts'

/**
 * « Relance les connexions acceptées sans réponse après trois jours » (§5.10).
 *
 * Le calcul est ici, pur et testé, parce qu'il porte la seule règle qui compte :
 * **ce qui arrête une relance**. Une réponse reçue arrête tout. Un message
 * envoyé APRÈS l'acceptation la met en pause — relancer quelqu'un à qui on vient
 * d'écrire est la façon la plus rapide de se faire ignorer, et c'est
 * exactement le reproche que le rapport fait aux séquences automatiques.
 *
 * Une acceptation plus RÉCENTE qu'un ancien échange rouvre le compteur : la
 * personne vient de réaccepter, l'histoire d'avant ne dit rien de maintenant.
 */

/** Le fait brut, tel qu'il sort de la base. */
export type InteractionFact = {
  contactId: string
  contactName: string | null
  kind: LinkedInInteractionKind
  occurredAt: string
}

const DAY_MS = 86_400_000

function time(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Les connexions acceptées restées silencieuses au-delà de `afterDays`.
 *
 * Trié du plus ancien silence au plus récent : c'est l'ordre dans lequel on
 * relance, et l'inverse de celui dans lequel une base les rend.
 */
export function pendingFollowUps(
  facts: readonly InteractionFact[],
  options: { now: Date; afterDays: number },
): LinkedInFollowUp[] {
  /** Par contact : la dernière acceptation, et le dernier geste qui la neutralise. */
  const accepted = new Map<string, { at: number; name: string | null }>()
  const silenced = new Map<string, number>()

  for (const fact of facts) {
    const at = time(fact.occurredAt)
    if (at == null) continue

    if (fact.kind === 'connection_accepted') {
      const current = accepted.get(fact.contactId)
      if (!current || at > current.at) accepted.set(fact.contactId, { at, name: fact.contactName })
      continue
    }
    // Une réponse reçue ou un message envoyé neutralisent la relance — mais
    // seulement s'ils sont POSTÉRIEURS à l'acceptation, d'où la comparaison
    // faite en second passage plutôt qu'ici.
    if (fact.kind === 'reply_received' || fact.kind === 'message_sent') {
      const current = silenced.get(fact.contactId)
      if (current == null || at > current) silenced.set(fact.contactId, at)
    }
  }

  const nowMs = options.now.getTime()
  const threshold = Math.max(0, options.afterDays) * DAY_MS

  const rows: LinkedInFollowUp[] = []
  for (const [contactId, { at, name }] of accepted) {
    const lastTouch = silenced.get(contactId)
    if (lastTouch != null && lastTouch >= at) continue
    const elapsed = nowMs - at
    if (elapsed < threshold) continue
    rows.push({
      contactId,
      contactName: name,
      acceptedAt: new Date(at).toISOString(),
      daysSinceAccepted: Math.floor(elapsed / DAY_MS),
    })
  }

  return rows.sort((a, b) => b.daysSinceAccepted - a.daysSinceAccepted || a.contactId.localeCompare(b.contactId))
}
