import { workspaceRoleValues, type WorkspaceRole } from '@bellum/contracts'

/**
 * #1909.3 — LE RÔLE PÈSE SUR L'ACCUEIL DE LAURA : L'ORDRE CHANGE, L'ENSEMBLE NON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ARBITRAGE, ET CE QU'IL INTERDIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis, 16/09/2026 : « le rôle pèse EN PLUS, il ne remplace pas les signaux
 * d'espace. » Les quatre familles de suggestions restent commandées par des
 * signaux RÉELS et mesurés (un vivier rempli, un portefeuille analysé, une
 * relation partenaire déclarée) ; le rôle dit seulement par QUELLE famille
 * l'accueil s'ouvre.
 *
 * 🔴 LE RISQUE EXACT, ET CE QUE LA GARDE TIENT. Si le rôle FILTRAIT au lieu
 * d'ordonner, quelqu'un perdrait des suggestions à cause de son étiquette — une
 * recruteuse ne verrait plus les comptes, un dirigeant ne verrait plus le
 * vivier. `laura-home-role-order.test.ts` vérifie donc, rôle par rôle, que
 * l'ENSEMBLE servi est identique au défaut et que seul l'ordre bouge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI APRÈS LA SÉLECTION, ET APRÈS LA COUPE
 * ─────────────────────────────────────────────────────────────────────────────
 * `resolveSuggestionIds` empile les familles vraies puis coupe à six.
 * Réordonner AVANT la coupe changerait l'ENSEMBLE servi — un rôle perdrait la
 * suggestion qu'un autre garde, et ce serait exactement le filtrage refusé.
 * Réordonner APRÈS ne touche qu'à ce qu'on lit en premier. C'est la forme du
 * précédent déjà validé, `apps/api/src/modules/briefing/briefing-role-order.ts`
 * (#1936.11), reprise à la lettre.
 *
 * ⚠️ POURQUOI UNE TABLE À PART, ET PAS CELLE DU BRIEF. Les deux répondent à deux
 * questions différentes : le brief classe des GENRES DE CARTE d'une journée,
 * celle-ci classe des FAMILLES DE SUGGESTION d'un écran vide. Le brief n'a
 * aucune famille « vivier », donc il range `recruiter` avec `sales` faute de
 * mieux ; ici la famille existe, et une recruteuse ouvre évidemment dessus.
 * Fusionner les deux tables obligerait à imposer la réponse de l'une à l'autre.
 */

/**
 * Les quatre familles de suggestions, dans l'ordre qui existait AVANT ce
 * fichier. C'est la lecture par défaut : un espace sans rôle lu voit exactement
 * ce qu'il voyait hier.
 */
export const HOME_SUGGESTION_FAMILIES = ['partners', 'portfolio', 'vivier', 'newUser'] as const

export type HomeSuggestionFamily = (typeof HOME_SUGGESTION_FAMILIES)[number]

/**
 * Les quatre lectures. Elles ne classent pas des « importances » : elles disent
 * par quoi l'écran vide COMMENCE pour qui l'ouvre. `newUser` ferme chaque
 * lecture parce que c'est un repli — il n'est jamais empilé avec les autres.
 */
const READINGS = {
  /** Les alliances, puis les comptes — celui qui vend. C'est aussi le défaut. */
  sales: ['partners', 'portfolio', 'vivier', 'newUser'],
  /** La charge de l'équipe d'abord : qui est disponible, sur quoi le placer. */
  manager: ['vivier', 'portfolio', 'partners', 'newUser'],
  /** Le pipe et les alliances — les comptes qui bougent, avec qui les ouvrir. */
  executive: ['portfolio', 'partners', 'vivier', 'newUser'],
  /** Le vivier, et rien d'autre en premier — celui qui tient les consultants. */
  staffing: ['vivier', 'partners', 'portfolio', 'newUser'],
} as const satisfies Record<string, readonly HomeSuggestionFamily[]>

/** ⚠️ Type NON exporté : il n'est consommé que dans ce fichier (règle « ne jamais
 *  exporter un type qui ne sort pas de son fichier », `pnpm lint:exports:types`). */
type HomeReading = keyof typeof READINGS

/**
 * Quel rôle lit quoi.
 *
 * ⚠️ C'est une table de ce qu'on SAIT, jamais de ce qu'on écarte : un rôle
 * ajouté demain à `workspaceRoleValues` (GA-08 les ajoute en fin) retombe sur la
 * lecture `sales`, c'est-à-dire sur l'ordre qui existait avant ce fichier. Un
 * rôle neuf ne change donc JAMAIS un accueil sans qu'on l'ait décidé.
 */
const READING_OF_ROLE: Record<WorkspaceRole, HomeReading> = {
  owner: 'executive',
  finance: 'executive',
  admin: 'manager',
  sales_ops: 'manager',
  tech_admin: 'manager',
  recruiter: 'staffing',
  sales: 'sales',
  member: 'sales',
  viewer: 'sales',
}

/** La lecture d'un rôle. `null`, absent ou inconnu = la lecture par défaut. */
export function homeReadingOf(role: WorkspaceRole | null | undefined): HomeReading {
  if (!role) return 'sales'
  return READING_OF_ROLE[role] ?? 'sales'
}

/** Tous les rôles connus de l'espace — le corpus que la garde relit. */
export const KNOWN_WORKSPACE_ROLES: readonly WorkspaceRole[] = workspaceRoleValues

/** Les familles d'une lecture, dans l'ordre. Exporté pour la garde. */
export function readingFamilies(reading: HomeReading): readonly HomeSuggestionFamily[] {
  return READINGS[reading]
}

/**
 * Les suggestions, réordonnées pour ce rôle. Même ensemble, même nombre —
 * JAMAIS un filtre. Une suggestion d'une famille inconnue de la lecture passe en
 * FIN plutôt que de disparaître : on ne perd pas une amorce parce qu'on ne sait
 * pas la ranger.
 *
 * Le tri est STABLE : deux suggestions de la même famille gardent l'ordre que la
 * sélection leur a donné. On ne recalcule aucune pertinence ici — on choisit par
 * quelle FAMILLE l'écran s'ouvre.
 */
export function orderByRole<T>(
  items: readonly T[],
  role: WorkspaceRole | null | undefined,
  familyOf: (item: T) => HomeSuggestionFamily,
): T[] {
  const order = READINGS[homeReadingOf(role)]
  const rankOf = (item: T): number => {
    const index = order.indexOf(familyOf(item))
    return index === -1 ? order.length : index
  }
  // `map` puis tri sur (rang, index d'origine) : le tri natif est stable depuis
  // ES2019, mais l'index rend la stabilité EXPLICITE et testable.
  return items
    .map((item, index) => ({ item, index, rank: rankOf(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.item)
}
