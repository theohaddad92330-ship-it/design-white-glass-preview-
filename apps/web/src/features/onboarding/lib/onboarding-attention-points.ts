import type { Question } from '@/features/onboarding/lib/questions'
import { QUESTION_CONSEQUENCE_KEY } from '@/features/onboarding/lib/question-consequences'
import type { ReviewBlock, ReviewEditTarget } from '@/features/onboarding/lib/onboarding-review-blocks'

/**
 * #2089.21/.22 — « Trois points méritent ton attention avant l'audit » : au
 * plus trois points, chacun avec tension (la question sans réponse) / impact
 * (ce que cette réponse change réellement — `question-consequences.ts`,
 * jamais un texte inventé pour l'occasion) / action (où répondre).
 *
 * Dérivé UNIQUEMENT des lignes réellement `missing` (jamais des blocs
 * `toVerify` sans donnée câblée, comme BU/Utilisateur/Système/Objectifs
 * aujourd'hui — un point d'attention sur une question qui n'existe pas
 * encore serait un point d'attention inventé). Une question sans conséquence
 * connue n'entre pas dans la liste : afficher une tension sans dire ce
 * qu'elle change serait pire que ne rien afficher (#2072.9 — ne jamais
 * présenter une absence comme une faiblesse prouvée SANS l'expliquer).
 */
// Non exporté : consommé uniquement dans ce fichier — `OnboardingReviewPage.tsx`
// n'importe que `buildAttentionPoints`, et infère le type de ses éléments.
type AttentionPoint = {
  key: string
  tensionLabelKey: string
  impactKey: string
  editTarget: ReviewEditTarget | null
}

const MAX_ATTENTION_POINTS = 3

export function buildAttentionPoints(blocks: ReviewBlock[]): AttentionPoint[] {
  const points: AttentionPoint[] = []
  for (const block of blocks) {
    for (const row of block.rows) {
      if (row.state !== 'missing') continue
      const impactKey = QUESTION_CONSEQUENCE_KEY[row.key as Question['key']]
      if (!impactKey) continue
      points.push({ key: row.key, tensionLabelKey: row.labelKey, impactKey, editTarget: block.editTarget })
      if (points.length >= MAX_ATTENTION_POINTS) return points
    }
  }
  return points
}
