type LastMissionRow = {
  label: string | null
  account_name: string | null
  ends_on: string | null
  starts_on?: string | null
  daily_rate: number | string | null
}

/**
 * #4016.8e (Louis 11/10/2026, c57) — la dernière mission du talent AVEC le dernier TJM vendu.
 *
 * Le tarif vendu reste celui de la MISSION (`missions.daily_rate`, rendu à tout membre — D45) :
 * ici il est PROPAGÉ en lecture seule vers la ligne du vivier, jamais saisi sur la fiche.
 * Absent, nul ou négatif ⇒ `null` — un « 0 €/j » se lirait « mission gratuite ».
 */
export function lastMissionView(row: LastMissionRow | undefined): {
  label: string | null
  accountName: string | null
  endsOn: string | null
  startsOn: string | null
  dailyRate: number | null
} | null {
  if (!row) return null
  const rate = row.daily_rate === null ? null : Number(row.daily_rate)
  return {
    label: row.label,
    accountName: row.account_name,
    endsOn: row.ends_on,
    // Théo C talents-vivier.R4 — « Démarrage prévu » quand ce début est à venir.
    startsOn: row.starts_on ?? null,
    dailyRate: rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null,
  }
}
