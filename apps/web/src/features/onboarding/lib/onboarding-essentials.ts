import { isAnswerFilled, ONBOARDING_ESSENTIAL_V23, type EsnAnswers } from '@bellum/contracts'

/**
 * Théo O onboarding-essentiel.N1 — LES CINQ BLOCS : le début du parcours guidé
 * (décision Louis 22/10, « une seule marche »).
 *
 * L'écran « essentiel » n'est plus une page à part : c'est la première moitié
 * du guide. Dix-huit repères, tous déjà présents dans notre catalogue (aucune
 * clé n'est renommée, donc aucune réponse déjà donnée ne se perd) ; l'espace est
 * utilisable dès qu'ils sont posés, le reste se précise ensuite.
 */
type EssentialBlock = {
  code: string
  keys: readonly (keyof EsnAnswers)[]
}

/** Les cinq blocs vivent à UN seul endroit : le catalogue V23 des contrats (GA-26). */
export const ONBOARDING_ESSENTIAL_BLOCKS: readonly EssentialBlock[] = ONBOARDING_ESSENTIAL_V23.map(block => ({
  code: block.id,
  keys: block.keys as readonly (keyof EsnAnswers)[],
}))

type EssentialBlockProgress = {
  code: string
  done: number
  total: number
  complete: boolean
}

function isKeyAnswered(answers: EsnAnswers, key: keyof EsnAnswers): boolean {
  return isAnswerFilled(answers[key] as Parameters<typeof isAnswerFilled>[0])
}

/** Combien de repères de chaque bloc ont une réponse — jamais « 0 » inventé : `total` reste nommé. */
export function essentialBlocksProgress(answers: EsnAnswers): EssentialBlockProgress[] {
  return ONBOARDING_ESSENTIAL_BLOCKS.map(block => {
    const done = block.keys.filter(key => isKeyAnswered(answers, key)).length
    return { code: block.code, done, total: block.keys.length, complete: done === block.keys.length }
  })
}

/** Le premier repère sans réponse, dans l'ordre de la maquette ; `null` quand les dix-huit sont posés. */
export function firstPendingEssentialKey(answers: EsnAnswers): keyof EsnAnswers | null {
  for (const block of ONBOARDING_ESSENTIAL_BLOCKS) {
    const pending = block.keys.find(key => !isKeyAnswered(answers, key))
    if (pending) return pending
  }
  return null
}
