/**
 * #3229 (recette prod 01/10) — « Mémoire consultée » gardait deux paires de
 * QUASI-doublons (« Ils refusent les CV anonymisés : nom et prénom exigés » /
 * « — nom et prénom exigés » ; « compter six semaines » / « comptez 6
 * semaines »). L'égalité de texte ne les voyait pas.
 *
 * AFFICHAGE seulement : les deux éléments restent dans Réglages › Mémoire, rien
 * n'est fusionné (doctrine « on propose, on ne fusionne jamais »). Deux
 * lectures sont la même sous une réponse quand l'une, une fois normalisée
 * (accents, ponctuation, nombres en lettres, radical de cinq lettres), est
 * CONTENUE dans l'autre — et jamais quand une négation les sépare (« ne pas
 * appeler Paul » ≠ « appeler Paul »).
 */

const NUMBER_WORDS: Record<string, string> = {
  un: '1',
  une: '1',
  deux: '2',
  trois: '3',
  quatre: '4',
  cinq: '5',
  six: '6',
  sept: '7',
  huit: '8',
  neuf: '9',
  dix: '10',
  douze: '12',
}

const NEGATIONS = new Set([
  'ne',
  'pas',
  'non',
  'jamais',
  'sans',
  'aucun',
  'aucune',
  'plus',
  'no',
  'not',
  'never',
  'without',
])

/** Plus petit nombre de mots qui permet de dire « contenu dans » sans risque. */
const MIN_CONTAINED_TOKENS = 3

const STEM_LENGTH = 5

function readingTokens(text: string): Set<string> {
  const words = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  return new Set(
    words.map(word => {
      const digit = NUMBER_WORDS[word]
      if (digit) return digit
      return NEGATIONS.has(word) ? word : word.slice(0, STEM_LENGTH)
    }),
  )
}

function negationsOf(tokens: Set<string>): string {
  return [...tokens]
    .filter(token => NEGATIONS.has(token))
    .sort()
    .join(',')
}

/** Vrai quand l'un des deux textes est la même lecture que l'autre, en plus court. */
export function isNearDuplicateReading(a: string, b: string): boolean {
  const ta = readingTokens(a)
  const tb = readingTokens(b)
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  if (small.size < MIN_CONTAINED_TOKENS) return false
  if (negationsOf(small) !== negationsOf(large)) return false
  return [...small].every(token => large.has(token))
}
