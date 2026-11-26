import type { ToolDailyCapStatus } from '@bellum/contracts'

/** Le métier de l'outil (clé `feature` de `provider_costs`). Console interne :
 *  un outil sans libellé garde sa clé, que l'opérateur a posée lui-même. */
const LIBELLES_OUTILS: Readonly<Record<string, string>> = {
  analysis: 'Analyse de compte',
  enrichment: 'Enrichissement de contacts',
}

export function libelleOutil(tool: string): string {
  return LIBELLES_OUTILS[tool] ?? tool
}

/**
 * #2440.45 — la dépense du jour d'UN outil contre son quota. Des lignes non
 * tarifées font du total un PLANCHER, et il le dit (GA-64) : jamais un total
 * partiel présenté comme un fait.
 */
export function libelleQuotaOutil(status: ToolDailyCapStatus): string {
  const depense = `${status.unpricedLines > 0 ? 'au moins ' : ''}${status.spentTodayUsd.toFixed(2)} $`
  const base = `${depense} sur ${status.capUsd.toFixed(2)} $ aujourd’hui`
  if (status.reached) return `${base} — atteint : l’outil est refusé jusqu’à minuit (UTC)`
  if (status.unpricedLines > 0) return `${base} (${status.unpricedLines} lignes non tarifées exclues)`
  return base
}
