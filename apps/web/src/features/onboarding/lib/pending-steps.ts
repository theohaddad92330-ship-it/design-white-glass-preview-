import { isAnswerPendingForMember, type EsnAnswers } from '@bellum/contracts'
import { TEMPS1_SUBSTEPS, isQuestionVisible, type FlatSubStep, type Question } from './questions'

/**
 * La première sous-étape qui porte encore une question à poser à CET
 * utilisateur — `null` quand il n'en reste aucune.
 *
 * ⚠️ POURQUOI (#1671-ter, retour de Louis du 07/09/2026)
 * « bedros est bien dans la team abricotlabs mais l'onboarding est encore lancé
 * quand il se connecte ». #1671-bis avait réparé la RÉSOLUTION d'espace : les
 * réponses de l'ESN arrivent bien jusqu'au questionnaire. Il restait que le flux
 * les REPOSE quand même, faute de savoir lesquelles étaient déjà répondues par
 * l'entreprise — douze questions, dont onze sont des faits sur l'ESN.
 *
 * La règle vit dans `isAnswerPendingForMember` (contrats), lue des deux côtés :
 * une question d'entreprise héritée ne se repose pas, une question personnelle
 * héritée si — sinon l'associé hérite du frein commercial de son collègue et on
 * ne lui pose plus jamais la seule question qui soit la sienne.
 *
 * ⚠️ `inherited` VIDE ⇒ cette fonction n'est pas appelée par le garde de route :
 * l'utilisateur seul dans son espace garde le chemin d'avant, à l'octet près.
 * C'est ce qui rend le lot inerte pour la quasi-totalité des comptes.
 *
 * #2022.4 — cette fonction ne redemande QUE les réponses ABSENTES
 * (`isAnswerPendingForMember`, contrats). Elle ne sait PAS dire « obsolète »
 * ou « contradictoire » — décision Louis 15/09/2026 : détecter ça demanderait
 * une date par réponse que la base ne porte pas, et deviner reposerait des
 * questions au hasard. Voir le commentaire complet côté contrat.
 *
 * #2059.7 — une question `optional` (« Comment as-tu connu {{brand}} ? ») ne
 * revient JAMAIS ici : sans cette exclusion, un utilisateur qui a
 * délibérément laissé la question vide serait renvoyé dessus à chaque
 * reprise, ce qu'« facultative, jamais bloquante » interdit exactement autant
 * qu'un bouton « Continuer » désactivé.
 */
/**
 * LE prédicat, écrit une fois. `firstPendingSubStep` et
 * {@link firstPendingQuestion} doivent répondre sur EXACTEMENT le même critère :
 * une reprise qui annonce une question et en ouvre une autre est pire qu'une
 * reprise muette. Une dérivation vit à un seul endroit (GA-26).
 */
function isPending(question: Question, answers: EsnAnswers, inheritedKeys: readonly (keyof EsnAnswers)[]): boolean {
  return (
    !question.optional &&
    // #2023.5 — une question que le branchement ne POSE pas n'est pas « en
    // attente » : y renvoyer quelqu'un l'enverrait sur un écran où elle
    // n'apparaît même pas. Le filtre vit DANS le prédicat, donc les deux
    // reprises (sous-étape et question) répondent sur le même critère.
    isQuestionVisible(question, answers) &&
    isAnswerPendingForMember(question.key, answers, inheritedKeys)
  )
}

export function firstPendingSubStep(answers: EsnAnswers, inherited: readonly string[]): FlatSubStep | null {
  const inheritedKeys = inherited as readonly (keyof EsnAnswers)[]
  return TEMPS1_SUBSTEPS.find(step => step.questions.some(q => isPending(q, answers, inheritedKeys))) ?? null
}

/**
 * #2004.24 — LA question exacte par laquelle la reprise redémarre, `null`
 * quand il n'y en a aucune.
 *
 * Pourquoi la question et pas la sous-étape : une sous-étape n'a qu'un `slug`
 * (`positionnement`, `secteurs`…) — un identifiant d'URL, pas une phrase qu'on
 * montre. La question, elle, porte déjà son libellé i18n aux deux langues, et
 * c'est littéralement l'écran sur lequel l'utilisateur va tomber. Nommer
 * l'étape par autre chose que ce qu'il va voir serait une promesse à côté.
 */
export function firstPendingQuestion(answers: EsnAnswers, inherited: readonly string[]): Question | null {
  const inheritedKeys = inherited as readonly (keyof EsnAnswers)[]
  for (const step of TEMPS1_SUBSTEPS) {
    const question = step.questions.find(q => isPending(q, answers, inheritedKeys))
    if (question) return question
  }
  return null
}
