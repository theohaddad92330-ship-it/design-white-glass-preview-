/**
 * #4016.L2.a — QUAND l'employeur d'un champion/sponsor a été relu pour la
 * dernière fois (`raw_data.employmentCheck.at`, posé par la routine
 * `contact_job_change`), ou `null`.
 *
 * Un fait DATÉ « vu le », jamais « vérifié » (c67). Sans date lisible : `null`
 * — jamais une date devinée, jamais une ligne vide.
 *
 * #4286.13.b — TOUT contact relu porte son « vu le », pas seulement un champion
 * ou un sponsor : la fiche relit n'importe quel contact au bout d'un mois.
 */
export function contactEmploymentSeenAt(rawData: Record<string, unknown> | null | undefined): string | null {
  const check = rawData?.['employmentCheck']
  if (typeof check !== 'object' || check === null) return null
  const at = (check as Record<string, unknown>)['at']
  if (typeof at !== 'string' || Number.isNaN(new Date(at).getTime())) return null
  return at
}
