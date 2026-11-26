import type { SubStep } from './types'
import { choice } from './types'

/** Sous-étape `entreprise` du stage `company_info`. */
export const entrepriseStep: SubStep = {
  slug: 'entreprise',
  questions: [
    {
      key: 'esn_name',
      kind: 'text',
      label: 'questions.esnName.label',
      subtitle: 'questions.esnName.subtitle',
      placeholder: 'questions.esnName.placeholder',
    },
    {
      key: 'consultant_size',
      kind: 'single',
      label: 'questions.consultantSize.label',
      choices: choice('1-10', '10-30', '30-80', '80-200', '200-500', '500+'),
    },
    /**
     * #2088.12 (DÉCISION Louis 18/09, point 16) — le nombre RÉEL de
     * consultants, ADDITIF à `consultant_size` juste au-dessus (une tranche,
     * ni retirée ni renommée). `optional: true` (#2059.7) : ce chiffre
     * précis ne bloque jamais « Continuer », la tranche suffit déjà à faire
     * avancer le questionnaire.
     */
    {
      key: 'consultant_count',
      kind: 'number',
      label: 'questions.consultantCount.label',
      subtitle: 'questions.consultantCount.subtitle',
      unitKey: 'questions.consultantCount.unit',
      optional: true,
    },
    /**
     * #2640.2 — le site de l'entreprise, ADDITIF comme `consultant_count`
     * juste au-dessus : le préremplissage (`esn_prefill.pick_website`,
     * SIREN → domaine d'e-mail → recherche par nom) le propose avec sa
     * source (`PrefillBadge`), et `optional: true` parce qu'une ESN sans
     * site public ne doit jamais être bloquée sur ce champ.
     */
    {
      key: 'esn_website',
      kind: 'text',
      label: 'questions.esnWebsite.label',
      subtitle: 'questions.esnWebsite.subtitle',
      placeholder: 'questions.esnWebsite.placeholder',
      optional: true,
    },
  ],
}
