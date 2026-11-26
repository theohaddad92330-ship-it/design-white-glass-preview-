import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-offre` du stage `offer_expertise` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (offer_pitch, language_capabilities). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageOffreStep: SubStep = {
  slug: 'cadrage-offre',
  questions: [
    {
      key: 'offer_pitch',
      kind: 'text',
      label: 'questions.offerPitch.label',
      subtitle: 'questions.offerPitch.subtitle',
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'language_capabilities',
      kind: 'multi',
      label: 'questions.languageCapabilities.label',
      subtitle: 'questions.languageCapabilities.subtitle',
      choices: choice('Français', 'Anglais', 'Allemand', 'Espagnol', 'Italien', 'Néerlandais', 'Portugais', 'Arabe'),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
  ],
}
