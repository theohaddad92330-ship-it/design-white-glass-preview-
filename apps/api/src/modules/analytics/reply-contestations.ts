/**
 * #2442.10 (épopée #2879, lot W9) — L'AGRÉGAT DES CONTESTATIONS ET CORRECTIONS
 * des réponses de Laura, par FONCTION.
 *
 * Troisième exception NOMMÉE à `c64_analytique_produit` (décision Louis
 * 11/10/2026) : on mesure la FONCTION (« les messages préparés sont contestés
 * dans un quart des cas »), JAMAIS la personne (« Sarah conteste Laura »).
 * Cette fonction pure ne reçoit donc que des COMPTES déjà groupés par
 * fonction — aucune ligne de personne, d'espace ou de contenu n'entre ici.
 *
 * Le plancher d'occurrences est celui de `product-analytics-privacy` (un seul
 * endroit, GA-26), passé en paramètre par l'appelant ; il est APPLIQUÉ ici
 * aussi, à la lecture (GA-267) : le SQL le pose, cette fonction le re-vérifie
 * pour qu'une requête qui l'oublierait ne publie pas sous le seuil.
 */
export type ReplyContestationRow = {
  /** La nature de l'action que la réponse proposait (`prepare_message`…). */
  tool: string
  /** Réponses DISTINCTES retournées pour cette fonction (empreintes distinctes). */
  replies: number
  feedbacks: number
  /** Retours autres que « utile ». */
  contested: number
  /** Retours qui corrigent une donnée (« donnée fausse » ou correction posée). */
  corrected: number
}

type ReplyContestationLine = ReplyContestationRow & {
  /** `contested / feedbacks` ; `null` sans aucun retour — jamais « 0 % » d'une absence. */
  contestedShare: number | null
}

export type ReplyContestationReport = {
  minDistinctReplies: number
  byTool: ReplyContestationLine[]
  /** Fonctions retenues sous le plancher : un COMPTE, jamais leur nom. */
  withheldTools: number
}

export function shapeReplyContestations(
  rows: readonly ReplyContestationRow[],
  minDistinctReplies: number,
): ReplyContestationReport {
  const published = rows.filter(row => row.replies >= minDistinctReplies)
  return {
    minDistinctReplies,
    withheldTools: rows.length - published.length,
    byTool: published
      .map(row => ({
        tool: row.tool,
        replies: row.replies,
        feedbacks: row.feedbacks,
        contested: row.contested,
        corrected: row.corrected,
        contestedShare: row.feedbacks > 0 ? row.contested / row.feedbacks : null,
      }))
      .sort((a, b) => b.contested - a.contested || a.tool.localeCompare(b.tool)),
  }
}
