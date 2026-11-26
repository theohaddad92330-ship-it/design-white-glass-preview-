import type { Question } from './questions'

/**
 * #2087.24 — « Chaque étape affiche : aide ». `OnboardingHelpCard.tsx` est une
 * carte de SUPPORT (contacter quelqu'un), pas une aide À RÉPONDRE — cette
 * table en est le pendant, une clé i18n optionnelle par question qui dit
 * COMMENT répondre (pas POURQUOI on la pose, déjà tenu par `rationaleKey`
 * dans `QuestionField.tsx`, ni CE QUE ça change, déjà tenu par
 * `question-consequences.ts`).
 *
 * Vit ICI plutôt que sur `Question` (`lib/questions/*.ts`) pour la même
 * raison que `QUESTION_CONSEQUENCE_KEY` (`question-consequences.ts:11-14`) :
 * ne pas rouvrir les fichiers de sous-étape que sept lots touchent déjà en
 * parallèle. Un lookup séparé, indexé par la même clé que `question.key`,
 * jamais un champ ajouté au contrat `EsnAnswers`.
 *
 * Partial à dessein : contrairement à `QUESTION_CONSEQUENCE_KEY`, aucune
 * garde n'exige une entrée par question Temps-1 — une question sans entrée
 * ici garde son rendu historique (pas d'aide affichée), exactement comme une
 * question sans `rationaleKey` n'affiche pas le bouton « Pourquoi cette
 * question ? ». Choisir QUELLES questions méritent une aide est une décision
 * de contenu au fil de l'eau, pas une exigence de complétude.
 */
export const QUESTION_HELP_KEY: Partial<Record<Question['key'], string>> = {
  esn_name: 'questionHelp.esnName',
  consultant_size: 'questionHelp.consultantSize',
}
