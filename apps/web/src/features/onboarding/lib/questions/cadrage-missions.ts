import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-missions` du stage `company_info` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (delivery_frictions). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageMissionsStep: SubStep = {
  slug: 'cadrage-missions',
  questions: [
    {
      key: 'delivery_frictions',
      kind: 'multi',
      label: 'questions.deliveryFrictions.label',
      subtitle: 'questions.deliveryFrictions.subtitle',
      choices: choice(
        'CRA / relevés d’activité',
        'Validations client',
        'Commandes / contrats',
        'Factures à préparer',
        'Factures à envoyer',
        'Encaissements / retards',
        'Renouvellements',
        'Marge / coûts inconnus',
        'Aucune difficulté déclarée',
      ),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
  ],
}
