/**
 * #4337.1 — LES COLONNES DU TABLEAU DES AFFAIRES, et le choix qu'on en fait.
 *
 * Neuf colonnes ne tiennent pas à 1 280 px : le tableau était coupé. Le nom de l'affaire reste épinglé (on ne lit pas
 * une ligne sans savoir de quelle affaire il s'agit) ; les colonnes que le code jugeait déjà secondaires — la dernière
 * activité et l'âge, les deux qui se masquaient en premier — passent derrière le menu « Colonnes » sur un écran
 * étroit. Un choix enregistré par l'utilisateur gagne toujours. Même discipline de stockage que
 * `features/missions/useMissionColumns` : lecture validée, écriture gardée, jamais d'exception qui remonte.
 */
export const PROJECT_COLUMN_KEYS = [
  'origin',
  'account',
  'owner',
  'stage',
  'amount',
  'lastActivity',
  'nextAction',
  'age',
] as const
export type ProjectColumnKey = (typeof PROJECT_COLUMN_KEYS)[number]

/** Le nom de l'affaire : toujours là, collé à gauche, absent du menu. */
export const PINNED_PROJECT_COLUMN = 'project'

export const DEFAULT_PROJECT_COLUMNS: readonly ProjectColumnKey[] = PROJECT_COLUMN_KEYS

/** Les colonnes secondaires : celles que le tableau masquait déjà en premier sur un écran étroit. */
const SECONDARY_PROJECT_COLUMNS: readonly ProjectColumnKey[] = ['lastActivity', 'age']

export const COMPACT_PROJECT_COLUMNS: readonly ProjectColumnKey[] = PROJECT_COLUMN_KEYS.filter(
  key => !SECONDARY_PROJECT_COLUMNS.includes(key),
)

/** Au-dessus de cette largeur, les neuf colonnes tiennent ; en dessous, les défauts sont les compacts. */
export const WIDE_PROJECT_TABLE_MIN_PX = 1440

const STORAGE_PREFIX = 'bellum:projects:columns:'

export function projectColumnsStorageKey(userId: string): string {
  return STORAGE_PREFIX + userId
}

function isProjectColumnKey(value: unknown): value is ProjectColumnKey {
  return typeof value === 'string' && (PROJECT_COLUMN_KEYS as readonly string[]).includes(value)
}

/** Remet une sélection dans l'ordre canonique : l'ordre des clics ne compte pas. */
export function canonicalProjectColumns(keys: readonly ProjectColumnKey[]): ProjectColumnKey[] {
  const chosen = new Set<ProjectColumnKey>(keys)
  return PROJECT_COLUMN_KEYS.filter(key => chosen.has(key))
}

/** Ce qui a été retenu, ou `null` si rien de lisible — une clé inconnue est écartée sans faire tomber le reste. */
export function readStoredProjectColumns(userId: string | null): ProjectColumnKey[] | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(projectColumnsStorageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const known = parsed.filter(isProjectColumnKey)
    return known.length === 0 ? null : canonicalProjectColumns(known)
  } catch {
    return null
  }
}

export function writeStoredProjectColumns(userId: string | null, keys: readonly ProjectColumnKey[]): void {
  // Déconnecté : une clé anonyme serait servie au premier utilisateur qui se connecte sur cette machine.
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(projectColumnsStorageKey(userId), JSON.stringify(keys))
  } catch {
    // Stockage refusé (navigation privée) : le choix vit le temps de la session.
  }
}

export function clearStoredProjectColumns(userId: string | null): void {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(projectColumnsStorageKey(userId))
  } catch {
    // Rien à faire : les défauts reprennent la main pour la session.
  }
}
