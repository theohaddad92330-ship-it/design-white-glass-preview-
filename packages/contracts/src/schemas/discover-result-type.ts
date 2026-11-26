import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Découvrir — LE TYPE DE RÉSULTAT (#2165.7 à #2165.10).               */
/*                                                                     */
/*  Découvrir ne rendait qu'une seule chose : des COMPTES. Le reste     */
/*  existait dans la réponse sans jamais être une ligne — les signaux   */
/*  étaient un ATTRIBUT d'un compte, les ESN un FILTRE de comptes, et   */
/*  les personnes n'existaient pas du tout. « Trouve-moi les DSI qui    */
/*  recrutent du .NET en Occitanie » n'avait donc aucune réponse        */
/*  possible : la question porte sur des personnes, l'écran ne sait     */
/*  répondre qu'en entreprises.                                        */
/*                                                                     */
/*  Ce fichier pose le vocabulaire — et une seule règle avec lui.       */
/* ------------------------------------------------------------------ */

/**
 * Les quatre types de résultat, dans l'ordre d'affichage du sélecteur.
 *
 * L'ordre n'est pas décoratif : il va du plus large au plus étroit, et
 * `accounts` reste en tête parce que c'est la seule lecture que Découvrir
 * rendait jusqu'ici — un utilisateur qui ne touche à rien retrouve son écran.
 *
 * ⚠️ Un type NE PROMET PAS une source nouvelle. `needs` et `partners` sont des
 * lectures de ce que la même recherche a DÉJÀ rendu (les signaux datés d'un
 * candidat, le NAF résolu d'un candidat) ; `contacts` lit les personnes que
 * l'espace connaît déjà. `calls` (#2545.1) CROISE les deux : les comptes de
 * la recherche et les personnes déjà connues de la même entreprise, dans un
 * seul tableau exportable — toujours aucune ligne inventée.
 */
export const DISCOVER_RESULT_TYPES = ['accounts', 'contacts', 'needs', 'partners', 'calls'] as const
export type DiscoverResultType = (typeof DISCOVER_RESULT_TYPES)[number]

export const discoverResultTypeSchema = z.enum(DISCOVER_RESULT_TYPES)

/** Le type d'ouverture — celui que Découvrir rendait avant ce lot. */
export const DEFAULT_DISCOVER_RESULT_TYPE: DiscoverResultType = 'accounts'

/**
 * #2165.10 — UN SEUL TYPE PRINCIPAL PAR RECHERCHE.
 *
 * La contrainte se tient ici, à la porte, plutôt que dans l'écran : une valeur
 * qui n'est pas exactement l'un des quatre (un lien collé de travers, un
 * tableau parce que l'URL portait deux fois `type=`, une casse différente)
 * retombe sur les comptes. Elle ne devient JAMAIS deux types, et elle ne casse
 * pas la page — même défense que `class` dans `routes/discover/index.tsx`.
 */
export function discoverResultTypeFrom(value: unknown): DiscoverResultType {
  const parsed = discoverResultTypeSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_DISCOVER_RESULT_TYPE
}

/* ------------------------------------------------------------------ */
/*  Le retournement NAF, côté TypeScript (#2165.9 / #2166.34).          */
/* ------------------------------------------------------------------ */

/**
 * Miroir EXACT de `ESN_NAF_PREFIXES` / `AMBIGUOUS_NAF_PREFIXES`
 * (`apps/ia/app/services/esn_naf.py`), gardé par
 * `discover-result-type.test.ts` qui LIT le module Python.
 *
 * Pourquoi un miroir plutôt qu'un appel : le service IA classe à la SOURCE,
 * quand il résout l'employeur d'une offre. L'écran, lui, doit reclasser des
 * candidats qu'il a déjà en main pour en faire une liste de partenaires, sans
 * refaire un aller-retour réseau. Les deux décisions sont la même, donc elles
 * se vérifient l'une contre l'autre plutôt que de diverger en silence.
 */
export const ESN_NAF_PREFIXES = ['620', '7022'] as const
export const AMBIGUOUS_NAF_PREFIXES = ['7022', '6209'] as const

/**
 * `esn` = ESN franche · `client` = compte final · `ambiguous` = le code
 * apparaît des DEUX côtés (70.22Z « conseil de gestion », 62.09Z « autres
 * activités informatiques ») · `null` = le NAF est absent ou trop court.
 *
 * ⚠️ `null` n'est PAS `client`. Ne pas connaître le NAF d'une entreprise ne dit
 * rien de son métier ; le ranger côté client parce que la résolution a échoué
 * fabriquerait un fait à partir d'une panne — c'est le tri-état de
 * `is_esn_naf_code` en Python, et il existe pour cette raison exacte.
 */
export type EsnNafClass = 'esn' | 'client' | 'ambiguous'

export function esnNafClass(nafCode: string | null | undefined): EsnNafClass | null {
  const digits = String(nafCode ?? '').replace(/\D/g, '')
  if (digits.length < 3) return null
  // L'ambiguïté se teste EN PREMIER : `6209` commence par `620`, donc l'ordre
  // inverse rangerait « autres activités informatiques » en ESN franche.
  if (AMBIGUOUS_NAF_PREFIXES.some(prefix => digits.startsWith(prefix))) return 'ambiguous'
  if (ESN_NAF_PREFIXES.some(prefix => digits.startsWith(prefix))) return 'esn'
  return 'client'
}
