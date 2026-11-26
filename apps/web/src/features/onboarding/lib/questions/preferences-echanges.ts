import { PROFILE_QUESTION_OPTIONS } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * #2058.2 / #2058.10 — les moments acceptés pour être sollicité et le niveau
 * de détail attendu des réponses. Existaient déjà en colonne (`esn_profiles`,
 * `EsnAnswers`) et côté profil progressif (`profile-questionnaire.ts`, bloc
 * `maturity`) depuis le 19/09, mais AUCUNE des cinq sections du Temps-1 ne les
 * posait : `TEMPS1_QUESTION_KEYS` — le catalogue que `Réglages › Profil`
 * (`EsnSection`) et la reconfiguration (`reconfigurationPlan`) comptent tous
 * les deux — les ignorait entièrement, alors que `GET /esn-profile` rendait
 * bien les deux colonnes.
 *
 * Réutilise le catalogue et le libellé DÉJÀ posés pour les mêmes questions
 * côté profil progressif (`PROFILE_QUESTION_OPTIONS.contact_windows` /
 * `.detail_level`, `profileQuestions.items.contact_windows.*` /
 * `.detail_level.*`) — même principe que `roleStep` (#2018.2, `user_role` /
 * `portfolio_size`) : la MÊME question, posée depuis un second point d'entrée,
 * jamais un second catalogue qui divergerait au premier ajout de choix.
 *
 * Posées à tout le monde, sans `when`, comme `proactivity_level` côté profil
 * progressif. AJOUTÉE EN FIN de `role.steps` (`lib/questions/index.ts`) :
 * l'ordre déjà posé ne bouge pas d'un cran.
 *
 * ⚠️ FACULTATIVES, et ce n'est pas un détail — défaut d'intégration mesuré le
 * 20/09/2026 : posées comme REQUISES, elles faisaient régresser en
 * « in_progress » l'étape « Toi et ton rôle » de tous les profils qui
 * l'avaient déjà terminée (`onboarding-progress.test.ts:235`, « attendu done,
 * reçu in_progress »). C'est exactement ce que #2060 avait déjà tranché dans
 * `onboarding-progress.ts` : « une question FACULTATIVE ne bloque jamais
 * terminé, sinon ajouter une question en fin de stage ferait régresser un
 * stage qui pouvait déjà l'être ». Ajouter une question à une étape close ne
 * doit jamais rouvrir cette étape chez ceux qui l'ont finie.
 */
export const preferencesEchangesStep: SubStep = {
  slug: 'preferences-echanges',
  questions: [
    {
      key: 'contact_windows',
      kind: 'multi',
      label: 'profileQuestions.items.contact_windows.label',
      subtitle: 'profileQuestions.items.contact_windows.subtitle',
      choices: choice(...PROFILE_QUESTION_OPTIONS.contact_windows),
      optional: true,
    },
    {
      key: 'detail_level',
      kind: 'single',
      label: 'profileQuestions.items.detail_level.label',
      subtitle: 'profileQuestions.items.detail_level.subtitle',
      choices: choice(...PROFILE_QUESTION_OPTIONS.detail_level),
      optional: true,
    },
  ],
}
