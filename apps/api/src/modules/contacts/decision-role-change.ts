/**
 * #2875 (#2402.3, lot P06) — ce qu'un passage de `contacts.decision_role` dit
 * d'un CHANGEMENT DE DÉCIDEUR.
 *
 * « Décideur » = les trois rôles MEDDIC qui décident ou achètent
 * (`economic` budget, `technical` validation technique, `procurement` porte
 * achats). Tranché sans Louis : `champion`/`influencer`/`blocker`/`user`
 * pèsent sur le deal mais ne le décident pas ; un passage de l'un à l'autre
 * n'est pas un changement de décideur. Un passage où l'UN des deux côtés est
 * décisionnel l'est (un décideur qui redevient utilisateur = il a quitté la
 * décision ; l'inverse = un nouveau décideur).
 *
 * Doctrine : une classification initiale (ancien rôle absent) n'est pas un
 * changement, et un rôle effacé non plus — « non mesuré » ne devient pas un
 * événement. Aucun nombre, aucune probabilité.
 */
const DECIDER_ROLES: ReadonlySet<string> = new Set(['economic', 'technical', 'procurement'])

function normalise(role: string | null | undefined): string | null {
  const value = (role ?? '').trim().toLowerCase()
  return value === '' ? null : value
}

export function describeDecisionRoleChange(
  from: string | null | undefined,
  to: string | null | undefined,
): { from: string; to: string } | null {
  const before = normalise(from)
  const after = normalise(to)
  if (!before || !after || before === after) return null
  if (!DECIDER_ROLES.has(before) && !DECIDER_ROLES.has(after)) return null
  return { from: before, to: after }
}
