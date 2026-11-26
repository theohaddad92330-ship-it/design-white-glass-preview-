import { PROJECT_STAGES, type ProjectRow, type ProjectStage } from '@bellum/contracts'

/**
 * Aides pures autour du PROJET — l'objet pivot du CRM/ATS.
 *
 * L'écran de portefeuille dérive encore des besoins de `raw_analysis` ; la table
 * des projets stocke les MÊMES lignes, clefées sur `(account_id, kind,
 * md5(label))` par la matérialisation. La jointure se fait donc sur
 * `${account_id}|${kind}|${labelNormalisé}` — le libellé est normalisé de la
 * même façon des deux côtés (minuscules, espaces repliés) pour survivre à une
 * dérive de casse.
 */

/** L'ordre d'affichage du cycle : celui du contrat, sans copie manuelle. Une
 *  liste recopiée oublie l'étape ajoutée six mois plus tard, et la carte
 *  disparaît de l'écran sans que rien ne le signale. */
export const PROJECT_STAGE_ORDER: ProjectStage[] = [...PROJECT_STAGES]

export function normalizeProjectLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function projectKey(accountId: string, kind: string, label: string): string {
  return `${accountId}|${kind}|${normalizeProjectLabel(label)}`
}

/** Indexe les projets de l'espace par leur clé de jointure, pour une recherche
 *  en O(1) depuis une carte de besoin. */
export function buildProjectIndex(rows: ProjectRow[]): Map<string, ProjectRow> {
  const index = new Map<string, ProjectRow>()
  for (const row of rows) {
    index.set(projectKey(row.account_id, row.kind, row.label), row)
  }
  return index
}

/** Restreint une chaîne du wire à une étape connue, `null` sinon. Une valeur
 *  inconnue (API plus récente que l'app) ne casse pas l'écran : elle n'affiche
 *  simplement pas de pastille. */
export function asStage(value: string | null | undefined): ProjectStage | null {
  return value && (PROJECT_STAGE_ORDER as string[]).includes(value) ? (value as ProjectStage) : null
}

/**
 * La teinte de la pastille par étape.
 *
 * `dormant` est en `warning` et non en `default` : « plus rien ne bouge » est
 * une information qui appelle un geste, pas un état neutre. `lost` reste neutre
 * — une perte assumée n'a pas à crier sur l'écran.
 */
export const STAGE_VARIANT: Record<ProjectStage, 'default' | 'primary' | 'success' | 'warning'> = {
  detected: 'default',
  potential: 'default',
  qualified: 'primary',
  confirmed: 'primary',
  profiles_submitted: 'primary',
  negotiation: 'warning',
  won: 'success',
  lost: 'default',
  dormant: 'warning',
}
