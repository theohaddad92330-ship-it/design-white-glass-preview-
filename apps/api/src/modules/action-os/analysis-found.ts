/**
 * #3416.x2 — le résumé « Ce que ça apprend » d'une analyse de compte, calculé à
 * UN seul endroit : au règlement du run (`CopilotCardService`) comme au
 * rattrapage des runs déjà réglés (`AnalysisFoundBackfillService`). Deux copies
 * du calcul divergeraient au premier changement de règle (GA-26).
 *
 * `null` sans contact visible : jamais un zéro (une absence n'est pas un zéro).
 */
export function summariseAnalysisFound(
  rows: ReadonlyArray<{ hidden?: boolean | null; email_verified?: boolean | null }>,
): { contacts: number; verifiedEmails: number } | null {
  const live = rows.filter(row => !row.hidden)
  if (live.length === 0) return null
  return { contacts: live.length, verifiedEmails: live.filter(row => row.email_verified === true).length }
}
