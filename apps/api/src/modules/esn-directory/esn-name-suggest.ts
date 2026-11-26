import { ESN_SUGGEST_MIN_QUERY_LENGTH, type EsnDirectorySuggestion } from '@bellum/contracts'
import { normalizeEsnName } from './esn-normalize'

/**
 * #1887 — LE CLASSEMENT DES SUGGESTIONS DU RÉFÉRENTIEL ESN.
 *
 * Pourquoi un fichier à part, et pas une méthode de plus sur le service : le
 * service est l'un des deux ÉCRIVAINS d'`esn_directory`, et la garde
 * `unwritten-columns.spec.ts` lit toute clé d'objet en position d'affectation
 * comme une écriture de colonne. Une simple RECOPIE de `siren` ou de
 * `parentName` vers une réponse HTTP y ressemblerait donc à un écrivain, et la
 * garde annoncerait qu'une colonne déclarée « sans source » vient d'en trouver
 * une. C'est exactement la raison — écrite noir sur blanc — pour laquelle
 * `territory-esn-breakdown.ts` existe déjà à côté du même service.
 *
 * Et surtout : le classement est ce qui décide de ce qu'un commercial voit en
 * premier. Ici, il se teste sans base.
 */

/** La forme LUE dans `esn_directory` — les seules colonnes que la suggestion touche. */
export type EsnSuggestRow = {
  inputName: string
  normalizedName: string
  siren: string | null
  headquartersCity: string | null
  headcountRange: string | null
  parentName: string | null
}

/**
 * La frappe, réduite à la forme de la CLÉ du référentiel.
 *
 * ⚠️ La même normalisation des DEUX côtés, et c'est tout l'enjeu : `ILIKE` est
 * insensible à la casse mais PAS aux accents — la leçon a coûté « aucune
 * entreprise ne ressort » sur une question qui en avait dix-neuf. Comme
 * `normalized_name` est déjà plié (accents retirés, casse repliée, tout ce qui
 * n'est pas `[a-z0-9]` ramené à une espace), comparer deux valeurs passées par
 * `normalizeEsnName` est exact par construction.
 *
 * Effet de bord heureux : la frappe normalisée ne peut contenir que `[a-z0-9 ]`.
 * Aucun `%`, aucun `_`, aucune barre oblique inverse n'en sort — le motif `LIKE`
 * bâti dessus n'a donc rien à échapper.
 *
 * Rend `''` quand la frappe ne porte pas de quoi chercher : sous deux
 * caractères indexables, une suggestion serait un échantillon arbitraire.
 */
export function esnSuggestNeedle(query: string): string {
  const needle = normalizeEsnName(query)
  return needle.length >= ESN_SUGGEST_MIN_QUERY_LENGTH ? needle : ''
}

/**
 * Le rang d'une entrée pour une frappe — le plus petit d'abord.
 *
 * 0 le nom EXACT · 1 le nom qui commence par la frappe · 2 un MOT qui commence
 * par la frappe · 3 le reste. « cap » doit rendre « Capgemini » avant
 * « Altran (Capgemini Engineering) », et « sud » doit rendre « SII Sud-Ouest »
 * avant « Assudia » : un fragment pris au milieu d'un mot ne se lit pas comme
 * une réponse à ce qu'on a tapé.
 */
function matchRank(normalizedName: string, needle: string): number {
  if (normalizedName === needle) return 0
  if (normalizedName.startsWith(needle)) return 1
  if (normalizedName.includes(` ${needle}`)) return 2
  return 3
}

/**
 * Combien d'entrées du référentiel sont des DÉCLINAISONS de ce nom.
 *
 * « Capgemini » porte « Capgemini Invent », « Capgemini France », « Capgemini
 * Engineering »… ; « Capco » n'en porte aucune. Les deux commencent par « cap »
 * et « Capco » est plus court — à la seule longueur, il passait devant, et le
 * retour disait exactement l'inverse : « je mets cap… ça nous met Capgemini ».
 *
 * Ce n'est pas une popularité inventée : c'est un fait DU RÉFÉRENTIEL. Un nom
 * dont il porte des déclinaisons est une tête de groupe, et c'est ce qu'un
 * commercial désigne quand il tape un préfixe.
 *
 * ⚠️ Le compte se fait sur les CANDIDATS (les lignes qui contiennent la frappe),
 * pas sur tout le référentiel : une déclinaison qui ne contiendrait pas la
 * frappe n'est pas comptée. C'est sans effet sur un préfixe — une déclinaison
 * commence par le nom de sa tête — et ça évite de charger la table entière à
 * chaque touche.
 */
function familySize(normalizedName: string, candidates: readonly EsnSuggestRow[]): number {
  return candidates.filter(other => other.normalizedName.startsWith(`${normalizedName} `)).length
}

/**
 * Les suggestions du référentiel pour une frappe, classées puis bornées.
 *
 * ⚠️ Rien ne sort d'ici qui ne vienne d'une LIGNE du référentiel : la frappe de
 * l'utilisateur n'est jamais reversée dans la liste sous les traits d'une
 * entreprise. Quand rien ne correspond, la liste est vide — c'est l'écran qui
 * le dit, et le commercial reste libre de saisir son nom à la main.
 *
 * Une entrée non résolue (ni SIREN, ni ville, ni effectif) se propose avec son
 * seul nom : l'écarter ferait disparaître des ESN réelles, la compléter serait
 * une donnée fictive.
 */
export function rankEsnSuggestions(
  rows: readonly EsnSuggestRow[],
  needle: string,
  limit: number,
): EsnDirectorySuggestion[] {
  if (needle.length === 0) return []
  const candidates = rows.filter(row => row.normalizedName.includes(needle))
  return candidates
    .map(row => ({
      row,
      rank: matchRank(row.normalizedName, needle),
      family: familySize(row.normalizedName, candidates),
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.family - a.family ||
        a.row.normalizedName.length - b.row.normalizedName.length ||
        a.row.normalizedName.localeCompare(b.row.normalizedName),
    )
    .slice(0, Math.max(0, limit))
    .map(({ row }) => ({
      name: row.inputName,
      normalizedName: row.normalizedName,
      siren: row.siren,
      city: row.headquartersCity,
      headcountRange: row.headcountRange,
      parentName: row.parentName,
    }))
}
