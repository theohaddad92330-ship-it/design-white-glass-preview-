import type { CompanySuggestion } from '@bellum/contracts'

/**
 * « Ces entités portent le même nom au registre » (#1111).
 *
 * « J'ai lancé plus tôt ce matin deux analyses, sur KLESIA et KLESIA ADP. C'est
 * la même chose, simplement des entités. […] quand je recherche une entreprise,
 * si elle a des entités et/ou appartient à un groupe, faudrait pouvoir choisir
 * entre distinguer si on ne veut que la filiale ou si on veut l'ensemble du
 * groupe. »
 *
 * Le sélecteur de périmètre EXISTE (groupe / France / filiales / …). Ce qui
 * manquait n'est pas le choix, c'est le SIGNAL : rien, au moment de choisir, ne
 * disait que « KLESIA ADP » avait cinq sœurs. Le doublon naît là.
 *
 * ── Ce qu'on affirme, et ce qu'on n'affirme pas ──────────────────────────
 *
 * ── DEUX signaux, parce qu'il y a DEUX sources ──────────────────────────
 *
 * 1. **La parenthèse du registre libre.** `recherche-entreprises` écrit
 *    `GIE KLESIA ADP (KLESIA)` : la parenthèse porte le sigle/nom d'usage
 *    DÉCLARÉ, c'est un fait publié. Le plus fort des deux.
 * 2. **Le terme cherché, présent dans plusieurs noms.** ⚠️ Trouvé en recette
 *    le 26/08 : la première version ne connaissait QUE la parenthèse, et le
 *    chemin nominal passe par **Pappers**, qui rend la raison sociale SANS
 *    elle (« KLESIA SA », « GIE KLESIA ADP », « GIE KLESIA »). Le signal était
 *    donc inerte là où il sert le plus. Compter les résultats qui portent le
 *    terme cherché est un fait sur la RECHERCHE, pas une inférence sur la
 *    détention — et il marche sur les deux chemins.
 *
 * On ne dit PAS « elles appartiennent au même groupe » : deux sociétés sans
 * lien peuvent partager un sigle, et rien dans cette réponse ne prouve une
 * détention. Affirmer le lien capitalistique demanderait une source qui n'est
 * pas là — c'est exactement le genre d'inférence que le produit s'interdit.
 *
 * ⚠️ Et on ne dit pas non plus « au registre ». Le compte porte sur les
 * suggestions AFFICHÉES — cinq au plus — pas sur le registre, qui en contient
 * 107 pour « KLESIA ». La première version l'écrivait, et c'était une
 * affirmation plus large que la mesure : exactement ce que ce dépôt refuse
 * partout ailleurs. Le libellé dit « N des résultats ».
 *
 * Aucun appel réseau : tout se calcule sur les suggestions DÉJÀ rendues.
 */

/** Un ensemble d'homonymes vu dans la liste courante. */
type RegistryNameGroup = {
  /** Le nom partagé, tel que le registre l'écrit. */
  label: string
  /** Combien de suggestions de la liste le portent. */
  count: number
}

/** En deçà, il n'y a pas d'ensemble — juste une société. */
const MIN_GROUP_SIZE = 2

/**
 * Le nom d'usage d'une suggestion : la parenthèse quand il y en a une, sinon
 * rien.
 *
 * Rien — et pas « le premier mot ». Se rabattre sur le premier mot ferait
 * cousiner « SOCIETE GENERALE » et « SOCIETE DES EAUX », qui ne partagent
 * qu'un mot du dictionnaire. La parenthèse, elle, est un champ du registre.
 */
function registryShortName(name: string): string | null {
  const match = name.match(/\(([^()]{2,60})\)\s*$/)
  return match ? match[1]!.trim() : null
}

/**
 * Les mots trop communs pour désigner un ensemble.
 *
 * Sans cette liste, chercher « société » rapprocherait « SOCIETE GENERALE » et
 * « SOCIETE DES EAUX », qui ne partagent qu'un mot du dictionnaire — et le
 * geste proposé (analyser le groupe entier) serait faux. Volontairement
 * COURTE : elle n'a pas à deviner, elle a à écarter les quelques mots qui
 * apparaissent dans des milliers de raisons sociales françaises.
 */
const TOO_COMMON = new Set([
  'societe',
  'groupe',
  'group',
  'compagnie',
  'holding',
  'france',
  'international',
  'services',
  'saint',
  'sainte',
  'nouvelle',
  'generale',
  'general',
])

/** Casse, accents et ponctuation neutralisés — la clé de rapprochement. */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Le terme cherché, s'il est assez distinctif pour désigner un ensemble.
 *
 * `null` quand il est trop court (moins de quatre caractères : « SG », « BNP »
 * apparaissent partout) ou trop commun. Un terme de PLUSIEURS mots est refusé
 * lui aussi : « CNP Assurances protection sociale » ne désigne pas un ensemble,
 * il désigne une société précise.
 */
function distinctiveQueryTerm(query: string): string | null {
  const words = normalise(query).split(' ').filter(Boolean)
  if (words.length !== 1) return null
  const term = words[0]!
  if (term.length < 4 || TOO_COMMON.has(term)) return null
  return term
}

/**
 * Pour chaque suggestion, l'ensemble d'homonymes auquel elle appartient dans la
 * liste courante — ou `null` quand elle est seule.
 *
 * Rendu sous forme de `Map` indexée par SIREN : c'est la clé stable d'une
 * suggestion de registre, et deux entités ne peuvent pas la partager.
 */
export function registryNameGroups(
  suggestions: readonly CompanySuggestion[],
  /** Ce que l'utilisateur a tapé. Absent = seul le signal de la parenthèse joue. */
  query = '',
): Map<string, RegistryNameGroup> {
  const counts = new Map<string, number>()
  for (const suggestion of suggestions) {
    const label = registryShortName(suggestion.name)
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  // Signal n°2 : combien de résultats portent le terme cherché comme un MOT.
  // « comme un mot » et non « en sous-chaîne » : « ALEDIA » contient « LED »
  // sans rien avoir à voir avec lui.
  const term = distinctiveQueryTerm(query)
  const bearers = term ? suggestions.filter(suggestion => normalise(suggestion.name).split(' ').includes(term)) : []
  const termLabel = term ? query.trim() : null

  const out = new Map<string, RegistryNameGroup>()
  for (const suggestion of suggestions) {
    if (!suggestion.siren) continue
    const label = registryShortName(suggestion.name)
    const count = label ? (counts.get(label) ?? 0) : 0
    if (label && count >= MIN_GROUP_SIZE) {
      // La parenthèse gagne : c'est un champ du registre, pas une coïncidence
      // de recherche.
      out.set(suggestion.siren, { label, count })
      continue
    }
    if (termLabel && bearers.length >= MIN_GROUP_SIZE && bearers.includes(suggestion)) {
      out.set(suggestion.siren, { label: termLabel, count: bearers.length })
    }
  }
  return out
}

/** L'ensemble d'UNE suggestion — `null` quand elle est seule de son nom. */
export function registryNameGroupOf(
  suggestion: CompanySuggestion | null,
  groups: Map<string, RegistryNameGroup>,
): RegistryNameGroup | null {
  if (!suggestion?.siren) return null
  return groups.get(suggestion.siren) ?? null
}
