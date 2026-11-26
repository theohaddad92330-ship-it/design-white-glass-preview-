/**
 * #3224 (recette prod 02/10) — « Je pars sur Je conserve tes secteurs… ne les
 * modifies pas.. » : l'IA renvoie parfois une hypothèse déjà RÉDIGÉE (une phrase
 * à la première personne) au lieu d'un groupe nominal. Le préfixe « Je pars
 * sur » ne s'applique qu'à un groupe nominal ; une phrase s'affiche telle
 * quelle, avec UNE seule ponctuation finale.
 */

const FIRST_PERSON_SENTENCE = /^(je|j['’])\s*/i

export function isAssumptionSentence(item: string): boolean {
  return FIRST_PERSON_SENTENCE.test(item.trim())
}

/** Ponctuation finale ramenée à un seul point : « pas.. » → « pas. ». */
export function withSingleTerminalPeriod(item: string): string {
  const trimmed = item.trim().replace(/[.\s]+$/, '')
  return trimmed ? `${trimmed}.` : ''
}

/** Sépare les groupes nominaux (préfixables) des phrases (jamais préfixées). */
export function composeAssumptions(assumptions: string[]): {
  phrases: string | null
  sentences: string | null
} {
  const cleaned = assumptions.map(item => item.trim()).filter(Boolean)
  const sentences = cleaned.filter(isAssumptionSentence).map(withSingleTerminalPeriod)
  const phrases = cleaned
    .filter(item => !isAssumptionSentence(item))
    .map(item => item.replace(/[.\s]+$/, ''))
    .filter(Boolean)
  return {
    phrases: phrases.length > 0 ? phrases.join(' · ') : null,
    sentences: sentences.length > 0 ? sentences.join(' ') : null,
  }
}
