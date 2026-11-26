import type { BaseReaderFamily } from '@bellum/contracts'

/**
 * #4792 — LES BORNES DU LECTEUR COMMUN DE LA BASE, À UN SEUL ENDROIT (GA-26).
 *
 * Même patron que `needs-history.limits.ts` (#4759), et pour la même raison : un plafond se relève là
 * où il se MESURE. Les journaliser (`base_reader.read`) permet de les relever si un appelant bute
 * dessus, au lieu de le deviner.
 *
 * ⚠️ Côté `@bellum/contracts` ne vivent que les TYPES du contrat : les VALEURS vivent ici, pour que
 * l'API et ses tests n'aient pas à charger le paquet de contrats à l'exécution pour lire un plafond.
 */

/**
 * L'ordre dans lequel la réponse rend les familles. Ajouts EN FIN (GA-08).
 *
 * `satisfies` fait échouer la COMPILATION si une famille du contrat manque ici ou si une famille
 * inconnue s'y glisse — la garde est le compilateur, pas un commentaire.
 */
export const BASE_READER_FAMILY_ORDER = [
  'accounts',
  'needs',
  'consultants',
] as const satisfies readonly BaseReaderFamily[]

/**
 * Ce qu'un appelant qui ne demande rien reçoit. 50 et pas 10 : le constat qui a ouvert l'épopée est
 * « Découvrir rend 10 à 15 comptes » alors que la base en porte des milliers. Un défaut bas
 * RE-FABRIQUE ce défaut à chaque nouvel appelant.
 */
export const BASE_READER_DEFAULT_LIMIT = 50

/**
 * Ce qu'UN appel rend au plus. 200 borne la TAILLE d'une réponse (un contexte de modèle, une page
 * d'écran), jamais le VOLUME atteignable : au-delà, l'appelant avance par `offset` — « un appelant
 * doit pouvoir dépasser 500 lignes sans réécrire la requête ». `total` dit toujours combien de lignes
 * correspondent, page ou pas.
 */
export const BASE_READER_MAX_LIMIT = 200

/**
 * La borne du parcours : 50 000 lignes par famille. Un `OFFSET` profond coûte à la base et aucun
 * appelant connu ne descend aussi bas ; la relever est un geste écrit, pas un accident.
 */
export const BASE_READER_MAX_OFFSET = 50_000

/**
 * Ramène une limite demandée dans ses bornes. Une seule fonction, pour que l'API, le pont IA et un
 * test ne dérivent pas trois arrondis différents : une valeur absente ou hors bornes retombe sur le
 * défaut ou le plafond, jamais sur `0` (une page de zéro ligne se lirait « rien trouvé »).
 */
export function clampBaseReaderLimit(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return BASE_READER_DEFAULT_LIMIT
  const asked = Math.trunc(limit)
  if (asked < 1) return BASE_READER_DEFAULT_LIMIT
  return Math.min(asked, BASE_READER_MAX_LIMIT)
}

/** Ramène un `offset` demandé dans ses bornes — négatif ou illisible : le début. */
export function clampBaseReaderOffset(offset: number | null | undefined): number {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return 0
  return Math.min(Math.max(Math.trunc(offset), 0), BASE_READER_MAX_OFFSET)
}
