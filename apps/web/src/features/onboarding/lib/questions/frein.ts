import type { SubStep } from './types'
import { choice } from './types'

/** Sous-étape `frein` du stage `target_market`. */
export const freinStep: SubStep = {
  slug: 'frein',
  questions: [
    {
      key: 'main_sales_pain',
      kind: 'single',
      label: 'questions.mainSalesPain.label',
      // #2088.28 — « Pourquoi cette question ? » : cette réponse-là est la
      // moins évidente à justifier (elle ressemble à un aveu), donc la
      // première où le bouton discret a un vrai texte à révéler.
      rationaleKey: 'questions.mainSalesPain.rationale',
      choices: choice(
        'Trouver les bons comptes à cibler',
        'Identifier les décideurs et trouver leurs coordonnées',
        "Personnaliser mes messages d'approche",
        'Me différencier des autres ESN sur les mêmes comptes',
        'Gérer mon temps entre prospection, delivery et management',
        'Convertir mes RDV en signatures',
        'Fidéliser mes comptes existants',
        'Former et coordonner mon équipe commerciale',
        'Je ne sais pas par où commencer',
        // #3385.3 (beta #3385, 30/09/2026) — six formulations STRATÉGIQUES,
        // additives : les neuf ci-dessus parlent du geste d'un commercial de
        // terrain, celles-ci du sujet d'un dirigeant ou d'un directeur
        // d'agence (marge, dépendance à quelques personnes, disponibilité
        // des profils, visibilité). Aucune réponse déjà donnée ne devient
        // orpheline — rien retiré.
        'Je manque de comptes qualifiés',
        "Mes comptes sont ouverts mais ne s'étendent pas",
        'Je manque de profils quand un besoin arrive',
        'Mes marges se dégradent',
        "Toute l'activité dépend de quelques personnes",
        'Je manque de visibilité sur ce qui fonctionne',
      ),
    },
  ],
}
