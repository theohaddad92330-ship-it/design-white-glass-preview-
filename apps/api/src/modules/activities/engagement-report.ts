/**
 * #3903 — « sur les 90 derniers jours, chez qui puis-je relancer pour faire du
 * business ? ». LA CLASSIFICATION, dérivée uniquement de ce que `activities`
 * (ActivitiesService) sait avec certitude pour UN compte dans la fenêtre : le
 * SENS de sa dernière interaction (email/appel/réunion/LinkedIn) et le silence
 * écoulé depuis.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE CLASSIFICATION NE FAIT PAS
 * ────────────────────────────────────────────────────────────────────────────
 * #3903 (lot M01, 09/10/2026) — « deal jamais closé » est désormais croisé :
 * une affaire OUVERTE du CRM rattachée au compte par la jointure #3918.a
 * (`crm_deal_facts.account_id`, id société / SIREN / domaine — jamais le nom).
 *
 * « Nogo déjà retenté » (l'autre catégorie demandée par #3903) est ABANDONNÉ
 * — décision Louis du 09/10/2026. Il n'est ni calculé ni nommé comme un manque
 * (`notEvaluated` ne le porte plus).
 */

/** Silence, en jours PLEINS depuis une sortante, à partir duquel une relance
 *  devient pertinente plutôt qu'une attente normale de réponse. */
export const REENGAGEMENT_SILENCE_DAYS = 14

type EngagementCategory = 'a_relancer' | 'en_attente_chez_nous' | 'en_attente_chez_le_client' | 'deal_jamais_close'

/** `timestamptz` → ISO string. Le driver pg rend parfois un `Date`, parfois une
 *  chaîne selon le parseur configuré — les deux formes sont acceptées. */
export function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString()
}

/**
 * Jours PLEINS écoulés entre `occurredAt` et `now`, jamais négatifs : une
 * horloge qui avance d'une seconde entre la requête SQL et ce calcul ne doit
 * jamais produire un silence négatif.
 */
export function daysSince(occurredAt: Date | string, now: Date = new Date()): number {
  const elapsedMs = now.getTime() - Date.parse(toIso(occurredAt))
  return Math.max(0, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)))
}

/**
 * La dernière interaction est ENTRANTE → la balle est chez nous : « en
 * attente (chez nous) ». Elle est SORTANTE → la balle est chez le client,
 * tant que le silence reste sous le seuil ; au-delà, c'est un candidat à la
 * relance.
 */
export function classifyEngagement(
  lastDirection: 'inbound' | 'outbound',
  daysSinceLast: number,
  openCrmDeals = 0,
): EngagementCategory {
  if (lastDirection === 'inbound') return 'en_attente_chez_nous'
  // #3903 (lot M01) — la balle est chez le client ET une affaire OUVERTE du CRM
  // est rattachée à ce compte (#3918.a, jamais par le nom) : « deal jamais
  // closé ». Une réponse due par nous (entrante) reste prioritaire au-dessus.
  if (openCrmDeals > 0) return 'deal_jamais_close'
  return daysSinceLast >= REENGAGEMENT_SILENCE_DAYS ? 'a_relancer' : 'en_attente_chez_le_client'
}

/** Une ligne du bilan : UN compte, sa dernière interaction dans la fenêtre, et
 *  la catégorie qu'elle dérive. */
export type EngagementReportRow = {
  accountId: string
  companyName: string
  lastOccurredAt: string
  lastDirection: 'inbound' | 'outbound'
  lastKind: string
  attempts: number
  /** #3904 (décision Louis 09/10) — les e-mails SORTANTS consécutifs les plus
   *  récents, sans aucune autre interaction après eux (ni réponse, ni appel, ni
   *  réunion). Deux = « appeler » plutôt qu'un troisième e-mail. */
  consecutiveOutboundEmails: number
  /** #3903 (lot M01) — les affaires OUVERTES du CRM rattachées à ce compte
   *  (`crm_deal_facts.account_id`, #3918.a) : leur nombre et leurs noms (3 au
   *  plus). 0 = aucune affaire ouverte rattachée — pas « aucune affaire ». */
  openCrmDeals: number
  openCrmDealNames: string[]
  category: EngagementCategory
}
