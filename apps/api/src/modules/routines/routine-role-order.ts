import {
  routineKeySchema,
  workspaceRoleValues,
  type RoutineKey,
  type RoutineRole,
  type WorkspaceProfile,
  type WorkspaceRole,
} from '@bellum/contracts'
import { ROUTINE_CATALOG } from './routine-catalog'

/**
 * #2399.8 (épopée #2843) — LA PERSONNALISATION PAR RÔLE : L'ORDRE CHANGE, LE
 * CATALOGUE NON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE #2399.8 DEMANDAIT, ET CE QUE CE FICHIER TRANCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Personnalisation par rôle/workspace » se lisait comme deux chantiers
 * distincts. L'axe CONNECTEUR est déjà là (`resolveBlockers`, une routine sans
 * boîte mail connectée se bloque déjà). L'axe WORKSPACE (une vue manager
 * multi-utilisateur) n'existe nulle part dans ce module — `RoutinesController`
 * reste `@PersonalScope` — et l'inventer ici fabriquerait une capacité de zéro,
 * hors du périmètre d'un point. Reste l'axe RÔLE, et la doctrine
 * `c76_role_reordonne_jamais_ne_filtre` (Louis 21/09/2026) le tranche déjà :
 * « le rôle change l'ORDRE, jamais le CONTENU ». Ce fichier applique donc au
 * catalogue des routines exactement le même patron déjà validé deux fois dans
 * ce dépôt — `briefing-role-order.ts` (#1936.11, serveur) et
 * `laura-home-role-order.ts` (#1909.3, client) — sans qu'aucune décision
 * produit neuve n'ait été nécessaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES FAMILLES, PAS UN RANG PAR CLÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `routineKeySchema` porte 43 clés. Un rang par clé et par rôle (le patron de
 * `briefing-role-order.ts`) demanderait 42×5 décisions ; les CINQ familles
 * ci-dessous reprennent au mot près le découpage que l'épopée #2843 pose déjà
 * dans son propre corps (#2398.1 COMMERCIAL, .2 RECRUTEUR, .3 MANAGER, .4 ADV,
 * .5 MISSION/DELIVERY), plus `general` pour ce qui n'appartient à aucun —
 * même patron que `newUser` côté `laura-home-role-order.ts`. Classer une clé
 * dans SA famille n'est donc pas une décision produit neuve : c'est relire une
 * classification que Louis a déjà écrite.
 *
 * ⚠️ Comme les deux précédents : AUCUNE lecture ne filtre. Les cinq lectures
 * ci-dessous portent chacune les SIX familles, exactement une fois —
 * `routine-role-order.spec.ts` le vérifie famille par famille.
 */

export type RoutineFamily = RoutineRole

/**
 * Chaque clé du catalogue, dans SA famille. `routine-role-order.spec.ts`
 * vérifie que cette table couvre TOUTES les clés de `routineKeySchema` — comme
 * LOT g26 l'a appris à `briefing-role-order.ts` à ses dépens, une table
 * recopiée à la main plutôt que dérivée du contrat prend du retard en silence
 * dès qu'une clé neuve rejoint le catalogue (GA-08 les ajoute en fin).
 */
// #2843.29 — la famille vit dans le catalogue (`roles[0]`), à UN seul endroit (GA-26) :
// elle était recopiée ici clé par clé, et une routine ajoutée au catalogue pouvait
// l'oublier. Le premier rôle déclaré est celui qui règle l'ordre.
const FAMILY_OF_ROUTINE = new Map<RoutineKey, RoutineFamily>(
  ROUTINE_CATALOG.map(definition => [definition.key, definition.roles[0]]),
)
const PROFILES_OF_ROUTINE = new Map<RoutineKey, readonly WorkspaceProfile[]>(
  ROUTINE_CATALOG.map(definition => [definition.key, definition.workspaceProfiles]),
)

/** Toutes les clés que le contrat connaît, jamais une copie locale (LOT g26). */
export const ROUTINE_KEYS: readonly RoutineKey[] = routineKeySchema.options

/** La famille d'une clé. Exportée pour la garde. */
export function familyOfRoutine(key: RoutineKey): RoutineFamily {
  return FAMILY_OF_ROUTINE.get(key) ?? 'general'
}

const READINGS = {
  /** Ses relances et ses rendez-vous — celui qui vend. C'est aussi le défaut. */
  sales: ['commercial', 'general', 'delivery', 'adv', 'manager', 'recruiter'],
  /** Le vivier — qui est disponible, sur quoi le placer. */
  recruiter: ['recruiter', 'general', 'commercial', 'delivery', 'manager', 'adv'],
  /** Les écarts d'équipe — hygiène CRM, marge, comptes sans plan. */
  manager: ['manager', 'general', 'commercial', 'delivery', 'adv', 'recruiter'],
  /** Le cash — facturation, relevés, contrats. */
  finance: ['adv', 'general', 'manager', 'commercial', 'delivery', 'recruiter'],
  /** Le pipe et la marge — un dirigeant. */
  executive: ['manager', 'adv', 'commercial', 'delivery', 'general', 'recruiter'],
} as const satisfies Record<string, readonly RoutineFamily[]>

/** ⚠️ Type NON exporté : consommé seulement dans ce fichier (règle knip). */
type RoutineReading = keyof typeof READINGS

/**
 * Quel rôle lit quoi. Un rôle ajouté demain à `workspaceRoleValues` (GA-08 les
 * ajoute en fin) retombe sur `sales`, l'ordre du catalogue tel qu'il est
 * aujourd'hui — un rôle neuf ne réordonne donc jamais les routines de
 * personne sans qu'on l'ait décidé.
 */
const READING_OF_ROLE: Record<WorkspaceRole, RoutineReading> = {
  owner: 'executive',
  finance: 'finance',
  admin: 'manager',
  sales_ops: 'manager',
  tech_admin: 'manager',
  recruiter: 'recruiter',
  sales: 'sales',
  member: 'sales',
  viewer: 'sales',
}

/** La lecture d'un rôle. `null`/absent/inconnu = la lecture par défaut. */
export function routineReadingOf(role: WorkspaceRole | null | undefined): RoutineReading {
  if (!role) return 'sales'
  return READING_OF_ROLE[role] ?? 'sales'
}

/** Tous les rôles connus de l'espace — le corpus que la garde relit. */
export const KNOWN_WORKSPACE_ROLES: readonly WorkspaceRole[] = workspaceRoleValues

/** Les familles d'une lecture, dans l'ordre. Exportées pour la garde. */
export function readingFamilies(reading: RoutineReading): readonly RoutineFamily[] {
  return READINGS[reading]
}

/**
 * Le catalogue, réordonné pour ce rôle. Même ensemble, même nombre — jamais un
 * filtre : une routine d'une famille inconnue de la lecture passerait en FIN
 * plutôt que de disparaître (n'arrive jamais aujourd'hui, les six familles
 * étant couvertes par les cinq lectures).
 *
 * Le tri est STABLE : deux routines de la même famille gardent l'ordre que le
 * catalogue leur donnait avant ce fichier.
 */
export function orderRoutinesForRole<T>(
  items: readonly T[],
  role: WorkspaceRole | null | undefined,
  keyOf: (item: T) => RoutineKey,
  /**
   * #2843.29 — le type d'espace : DANS une même famille, une routine pertinente
   * pour ce profil passe avant une routine qui ne l'est pas. Ordre seulement,
   * jamais présence (c76). `null`/absent = aucune supposition sur l'espace.
   */
  profile: WorkspaceProfile | null = null,
): T[] {
  const order = READINGS[routineReadingOf(role)]
  const rankOf = (item: T): number => {
    const index = order.indexOf(familyOfRoutine(keyOf(item)))
    return index === -1 ? order.length : index
  }
  const profileRankOf = (item: T): number =>
    profile && !(PROFILES_OF_ROUTINE.get(keyOf(item)) ?? []).includes(profile) ? 1 : 0
  return items
    .map((item, index) => ({ item, index, rank: rankOf(item), profileRank: profileRankOf(item) }))
    .sort((a, b) => a.rank - b.rank || a.profileRank - b.profileRank || a.index - b.index)
    .map(entry => entry.item)
}
