/**
 * #2319.5 — LA FILIALE DU COMPTE ASSOCIÉ AU RENDEZ-VOUS.
 *
 * `accounts.group_role` / `.group_head_siren` / `.group_link_observed_at`
 * existaient déjà en base (migration `1795650000000`, filtre Groupe/filiale
 * de Découvrir, #2165.24) et jusqu'au contrat (`accountSchema`) — mais rien,
 * côté rendez-vous, ne les lisait : savoir qu'on va rencontrer la FILIALE
 * d'un groupe plutôt que sa tête change ce qu'on cherche à obtenir.
 *
 * ⚠️ Même règle que les trois faits voisins du brief (secteur, effectif,
 * chiffre d'affaires) : un lien SANS date d'observation ne date rien, donc il
 * ne s'affiche pas — `group_role` seul ne suffit pas à dire que le lien tient
 * encore (doctrine du fichier de migration).
 */

type AccountGroupLink = {
  readonly group_role?: 'groupe' | 'filiale' | null
  readonly group_head_siren?: string | null
  readonly group_link_observed_at?: string | null
}

type ResolvedGroupRoleFact = {
  readonly role: 'groupe' | 'filiale'
  readonly headSiren: string | null
  readonly date: string
}

/** `null` = aucun lien connu, ou connu mais non daté — jamais un rôle deviné. */
export function resolveAccountGroupRoleFact(account: AccountGroupLink): ResolvedGroupRoleFact | null {
  if (account.group_role !== 'groupe' && account.group_role !== 'filiale') return null
  if (!account.group_link_observed_at) return null
  return {
    role: account.group_role,
    headSiren: account.group_head_siren ?? null,
    date: account.group_link_observed_at,
  }
}
