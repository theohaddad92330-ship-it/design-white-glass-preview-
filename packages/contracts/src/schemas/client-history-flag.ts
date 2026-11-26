import { z } from 'zod'

/**
 * Le drapeau « déjà vu chez ce client » (PDF 3 §7.2, ticket BEL-ATS-205).
 *
 * « C'est la façon la plus rapide de perdre un compte que de repousser un
 * profil refusé. » Le matching était pourtant AVEUGLE à l'historique : il
 * classait le vivier contre un besoin sans jamais lire les positionnements, si
 * bien qu'un profil refusé chez EDF en janvier remontait premier sur le besoin
 * EDF de mars.
 *
 * Deux distinctions portent tout le module :
 *
 *  - **`no_feedback` n'est PAS un refus.** Un silence n'est pas une décision, et
 *    le peindre en rouge ferait écarter des profils que le client n'a jamais
 *    regardés. Il a son propre état, gris.
 *  - **le drapeau vaut pour TOUT le compte**, pas pour le seul besoin d'origine.
 *    Un client qui a dit non à quelqu'un ne l'a pas dit à un poste, il l'a dit à
 *    une personne — et il s'en souviendra sur le besoin suivant.
 */

export const CLIENT_HISTORY_FLAGS = [
  'rejected', //     refusé, avec un motif — badge rouge
  'no_feedback', //  présenté, jamais de réponse — badge gris
  'submitted', //    présenté, encore en cours
  'accepted', //     déjà retenu chez ce client
] as const
export const clientHistoryFlagSchema = z.enum(CLIENT_HISTORY_FLAGS)
export type ClientHistoryFlag = (typeof CLIENT_HISTORY_FLAGS)[number]

/**
 * Les motifs de refus qui NE BLOQUENT PAS un repositionnement (§11).
 *
 * Un refus sur le prix ou la disponibilité dit « pas maintenant » ; un refus
 * sur les compétences ou la séniorité dit « pas cette personne ». Les traiter
 * pareil ferait soit perdre des profils repositionnables, soit repousser des
 * profils que le client a jugés inadaptés.
 */
export const RECOVERABLE_REJECTION_REASONS = ['price', 'availability', 'need_cancelled'] as const

/** Ce qu'on sait d'un passage antérieur chez ce client. */
export type ClientHistoryEntry = {
  consultantId: string
  stage: string
  outcomeReason: string | null
  closedAt: string | null
}

export const clientHistoryMarkSchema = z.object({
  flag: clientHistoryFlagSchema,
  /** Le motif, tel qu'il a été enregistré. `null` quand il n'y en a pas. */
  reason: z.string().nullable(),
  /** Quand. `null` si le positionnement est encore ouvert. */
  at: z.string().nullable(),
  /** Un refus sur le prix ou le calendrier se rejoue ; sur les compétences, non. */
  recoverable: z.boolean(),
})
export type ClientHistoryMark = z.infer<typeof clientHistoryMarkSchema>

/**
 * Ce qu'il faut dire d'un talent sur un besoin de CE compte.
 *
 * Rend `null` quand la personne n'y est jamais passée — et c'est le cas le plus
 * fréquent : afficher un badge « jamais vu » sur tout le vivier noierait le seul
 * badge qui compte.
 *
 * Quand plusieurs passages existent, le plus GRAVE l'emporte : un refus survit
 * à un silence, parce que c'est lui qui coûte un compte.
 */
export function markClientHistory(
  consultantId: string,
  history: readonly ClientHistoryEntry[],
): ClientHistoryMark | null {
  const mine = history.filter(entry => entry.consultantId === consultantId)
  if (mine.length === 0) return null

  const rank: Record<ClientHistoryFlag, number> = { rejected: 0, no_feedback: 1, accepted: 2, submitted: 3 }
  let best: ClientHistoryMark | null = null

  for (const entry of mine) {
    const flag = flagFor(entry)
    if (!flag) continue
    const mark: ClientHistoryMark = {
      flag,
      reason: entry.outcomeReason,
      at: entry.closedAt,
      recoverable:
        flag === 'rejected' &&
        entry.outcomeReason !== null &&
        (RECOVERABLE_REJECTION_REASONS as readonly string[]).includes(entry.outcomeReason),
    }
    if (!best || rank[mark.flag] < rank[best.flag]) best = mark
  }
  return best
}

function flagFor(entry: ClientHistoryEntry): ClientHistoryFlag | null {
  if (entry.stage === 'accepted') return 'accepted'
  if (entry.stage === 'rejected') {
    // Un silence n'est pas une décision : le peindre en rouge ferait écarter
    // des profils que le client n'a jamais regardés.
    return entry.outcomeReason === 'no_feedback' ? 'no_feedback' : 'rejected'
  }
  if (entry.stage === 'withdrawn') return null
  // `shortlisted`, `submitted`, `interview` : le profil est encore en jeu chez
  // ce client, et le repousser sur un autre besoin est un doublon, pas un
  // risque de refus.
  return 'submitted'
}
