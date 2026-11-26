import { SALES_FREIN_CHOICES } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'
import { answered } from './visibility'

/**
 * Sous-étape `freins` du stage `target_market` — #2055 (« ce qui empêche
 * réellement d'avancer »).
 *
 * La sous-étape `frein` juste avant demande LE plus gros frein, en un seul
 * choix. Celle-ci fait le reste du travail, et c'est le reste qui sert :
 *
 *  - les quelques freins qui pèsent vraiment, texte libre compris (#2055.1-.14) ;
 *  - les trois relances qui séparent un SYMPTÔME d'un goulot (#2055.15) :
 *    « Qu'as-tu essayé ? », « Qu'est-ce qui s'est arrêté ? », « Pourquoi ? ».
 *
 * Ce que ces trois questions évitent : « je n'ai pas le temps » est vrai et
 * n'explique rien. Ce qui a été tenté, ce qui s'est arrêté et pourquoi, voilà
 * ce qu'un plan d'action peut prendre en compte. {@link readSalesFreins}
 * (contrat) les rend NOMMÉS SÉPARÉMENT — le produit ne déduit jamais la cause
 * d'une case cochée (#2055.16).
 *
 * Aucune n'est obligatoire : elles ne sont pas dans `TEMPS1_REQUIRED_KEYS`, et
 * une question passée reste `null` — un frein non renseigné n'est pas un frein
 * absent.
 */
export const freinsStep: SubStep = {
  slug: 'freins',
  questions: [
    // #2055.1-.13 — les seize freins, catalogue tenu dans le contrat
    // (`onboarding/answers-freins.ts`) et nulle part ailleurs.
    // #2055.14 — `allowOther` : celui qui n'est pas dans la liste s'écrit, et
    // atterrit dans le MÊME tableau que les cases cochées.
    {
      key: 'sales_freins',
      kind: 'multi',
      label: 'questions.salesFreins.label',
      subtitle: 'questions.salesFreins.subtitle',
      choices: choice(...SALES_FREIN_CHOICES),
      allowOther: true,
    },
    // #2055.15 — « Qu'as-tu déjà essayé ? »
    {
      key: 'frein_attempted',
      kind: 'text',
      label: 'questions.freinAttempted.label',
      subtitle: 'questions.freinAttempted.subtitle',
      placeholder: 'questions.freinAttempted.placeholder',
    },
    // #2055.15 — « Qu'est-ce qui s'est arrêté ? »
    {
      key: 'frein_stopped',
      kind: 'text',
      label: 'questions.freinStopped.label',
      placeholder: 'questions.freinStopped.placeholder',
    },
    // #2055.15 — « Pourquoi ? » — la seule des trois qui approche du goulot.
    //
    // #2023.5 — LA PREMIÈRE BRANCHE RÉELLE du questionnaire. « Pourquoi ça
    // s'est arrêté ? » posée à quelqu'un qui n'a rien dit s'être arrêté n'est
    // pas une question difficile, c'est une question SANS OBJET : elle appelle
    // soit un blanc, soit une réponse inventée pour avancer. Elle n'apparaît
    // donc qu'une fois la cause nommée — et elle DISPARAÎT si la cause est
    // effacée, sans perdre ce qui avait été écrit (`visibility.ts`).
    {
      key: 'frein_stopped_reason',
      kind: 'text',
      label: 'questions.freinStoppedReason.label',
      subtitle: 'questions.freinStoppedReason.subtitle',
      placeholder: 'questions.freinStoppedReason.placeholder',
      when: answers => answered(answers.frein_stopped),
    },
  ],
}
