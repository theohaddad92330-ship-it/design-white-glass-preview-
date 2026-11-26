/**
 * La fenêtre d'essai, en pur calcul — aucune dépendance NestJS, aucun dépôt.
 *
 * Ce fichier existe pour que la règle « l'essai est-il terminé ? » soit lisible
 * par un autre module SANS importer `credits.service.ts` : la garde GA-07
 * (`apps/api/src/architecture/module-boundaries.spec.ts`) compte les services
 * qui vont chercher le service d'un autre module, et le #4629.2 en ajoutait un
 * (`plan-features.service.ts` → `credits/credits.service`) pour une fonction
 * qui ne touche ni injection, ni base. La règle reste à UN seul endroit
 * (GA-26) ; `credits.service.ts` la réexporte, c'est toujours lui qui la
 * publie.
 */

/**
 * Les plans à FENÊTRE : leur `trial_end` verrouille le compte une fois passé.
 *
 * ⚠️ Depuis le 02/09/2026 aucun des deux n'ouvre plus rien — leur quota est à
 * zéro (voir `SHIPPED_PLAN_GRID`) et il n'existe aucun chemin pour les obtenir.
 * La liste RESTE parce que des lignes en base les portent : sans elle, un compte
 * historique dont la fenêtre est passée redeviendrait dépensable si un opérateur
 * lui reposait un quota depuis le backoffice.
 */
export const WINDOWED_PLANS = ['trial', 'decouverte'] as const

/** True when the row is a windowed plan whose window has closed (locked). */
export function isTrialExpired(row: { plan?: string | null; trial_end?: Date | string | null } | null): boolean {
  if (!row || !row.trial_end) return false
  if (!(WINDOWED_PLANS as readonly string[]).includes(row.plan ?? '')) return false
  return new Date(row.trial_end).getTime() <= Date.now()
}
