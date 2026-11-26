/**
 * Le choix des colonnes de la grande table — même patron que
 * `@/features/missions/useMissionColumns.ts` (GA-26 : le réglage vit dans UN
 * hook, le tableau et le sélecteur le LISENT tous les deux), réduit à ce que
 * cet écran a réellement de FACULTATIF.
 *
 * Cinq colonnes sont ÉPINGLÉES — Mission, CRA, Facturation, Paiement et
 * Prochaine action portent la raison d'être de l'écran (D-22-2 : c'est leur
 * cooccurrence, ligne à ligne, qui manquait). Consultant et Période sont les
 * deux seules dont l'absence ne fait perdre aucune information CROISÉE — leur
 * masquer une colonne redonne de la largeur sur un petit écran sans retirer ce
 * que la table existe pour montrer.
 */
export const MISSION_TRACKING_COLUMN_KEYS = [
  'mission',
  'consultant',
  'client',
  'period',
  'cra',
  'invoicing',
  'payment',
  'nextAction',
] as const

export type MissionTrackingColumnKey = (typeof MISSION_TRACKING_COLUMN_KEYS)[number]

export const PINNED_MISSION_TRACKING_COLUMNS: ReadonlySet<MissionTrackingColumnKey> = new Set([
  'mission',
  'cra',
  'invoicing',
  'payment',
  'nextAction',
])

/**
 * Les colonnes NÉES après qu'un utilisateur a pu enregistrer son choix.
 *
 * ⚠️ Ce n'est PAS la liste des défauts. Une préférence enregistrée avant qu'une
 * colonne existe ne la contient pas ; la rendre telle quelle masque la colonne
 * neuve à tous ceux qui ont déjà ouvert l'écran — le défaut mesuré en
 * production le 04/09/2026 sur « Prochaine action » de `/missions`.
 *
 * Vide aujourd'hui : aucune colonne n'a encore été ajoutée à cet écran depuis
 * qu'il persiste un choix. Quand une le sera, elle s'inscrit ICI en même temps.
 * `column-preference-lists-new-columns.test.ts` le vérifie.
 */
export const MISSION_TRACKING_COLUMNS_ADDED_SINCE: readonly MissionTrackingColumnKey[] = [] as const

export const DEFAULT_MISSION_TRACKING_COLUMNS: readonly MissionTrackingColumnKey[] = MISSION_TRACKING_COLUMN_KEYS

export function isMissionTrackingColumnKey(value: unknown): value is MissionTrackingColumnKey {
  return typeof value === 'string' && (MISSION_TRACKING_COLUMN_KEYS as readonly string[]).includes(value)
}
