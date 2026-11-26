import type { SubStep } from './types'
import { choice } from './types'

/** Sous-étape `positionnement` du stage `offer_expertise`. */
export const positionnementStep: SubStep = {
  slug: 'positionnement',
  questions: [
    {
      key: 'positioning',
      kind: 'single',
      label: 'questions.positioning.label',
      // #2539.2 — chaque positionnement porte une phrase (FR+EN) ; `value`
      // reste le libellé verbatim persisté.
      choices: [
        {
          value: 'Expertise de niche - spécialisé sur 1-2 domaines pointus',
          descriptionKey: 'questions.positioningChoices.niche',
        },
        {
          value: 'Multi-compétences ciblées - 3-5 domaines avec références solides',
          descriptionKey: 'questions.positioningChoices.multiCompetences',
        },
        {
          value: 'Généraliste - large spectre selon les besoins client',
          descriptionKey: 'questions.positioningChoices.generaliste',
        },
        {
          value: 'Régie pure - on place des profils sur demande',
          descriptionKey: 'questions.positioningChoices.regiePure',
        },
        {
          value: 'Conseil & Delivery - cadrage + exécution',
          descriptionKey: 'questions.positioningChoices.conseilDelivery',
        },
      ],
    },
    {
      key: 'staffing_model',
      kind: 'single',
      label: 'questions.staffingModel.label',
      choices: choice(
        'Uniquement des CDI internes',
        'Principalement CDI + quelques freelances ponctuels',
        'Mix équilibré CDI / Freelances',
        'Principalement freelances / sous-traitants',
        'Uniquement freelances (pas de CDI)',
      ),
    },
  ],
}
