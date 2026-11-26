import { familySkill, relatedSkill, strictSameSkill } from '../skill-referential'

/**
 * Le peu de traitement de texte dont les treize axes ont besoin.
 *
 * Volontairement pauvre : minuscules, sans accent, sans ponctuation. Il ne
 * prétend pas faire de la sémantique — c'est ce qui le rend reproductible, et
 * la reproductibilité est une obligation ici, pas une élégance.
 */
export function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim()
}

/** Les mots significatifs d'un texte — au moins trois lettres. */
export function words(value: string): string[] {
  return normalise(value)
    .split(' ')
    .filter(word => word.length >= 3)
}

/**
 * Deux écritures désignent-elles LA MÊME compétence ?
 *
 * Version STRICTE du référentiel : « K8s » et « Kubernetes » se rencontrent
 * enfin, mais « Databricks » ne prouve pas « Spark » et « Oracle » ne prouve pas
 * « PostgreSQL ». Un faux négatif de vivier fait rater un profil ; un faux
 * positif de matching écrit à un client qu'une compétence est prouvée alors
 * qu'elle ne l'est pas, et cela se découvre en soutenance.
 */
export function sameTerm(left: string, right: string): boolean {
  return strictSameSkill(left, right)
}

/**
 * Deux écritures se RECOUPENT-elles sans être la même compétence ?
 *
 * C'est l'adjacence du §3.1 : « Flink » quand on demande « Spark Streaming ».
 * Elle est SIGNALÉE, jamais comptée — le recruteur voit « a fait Flink, pas
 * Spark » et décide. La compter reviendrait à proposer quelqu'un sur une
 * compétence qu'il n'a pas.
 */
export function overlaps(left: string, right: string): boolean {
  if (sameTerm(left, right)) return false
  if (relatedSkill(left, right)) return true
  // #4434 — même FAMILLE du référentiel partagé (Angular présent, React demandé) : adjacente, jamais comptée.
  if (familySkill(left, right)) return true
  const a = new Set(words(left))
  const b = words(right)
  return b.some(word => a.has(word))
}

/** Un texte contient-il ce terme, alias compris ? */
export function mentions(haystack: string, term: string): boolean {
  const bag = words(haystack)
  if (bag.some(word => sameTerm(word, term))) return true
  const phrase = normalise(haystack)
  const needle = normalise(term)
  return needle.length >= 3 && phrase.includes(needle)
}
