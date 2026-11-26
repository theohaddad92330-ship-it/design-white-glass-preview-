import type { SubStep } from './types'

/**
 * Sous-étape `recrutement` du stage `offer_expertise`.
 *
 * Le placement en CDI chez le client (#1124).
 *
 * « Je propose aussi à mes clients du recrutement de profil IT en fixe chez
 * eux. Donc si tu peux me sortir les annonces de postes comme ça, je suis
 * assez refait. »
 *
 * Valeurs MACHINE (`yes` / `no`) avec leur libellé en i18n : une dérivation
 * qui comparerait la phrase affichée se casserait au premier reformulage,
 * en silence. Le sous-titre annonce la CONSÉQUENCE — les offres d'emploi
 * cessent d'être filtrées aux rôles IT — parce qu'une question dont on ne
 * voit pas l'effet se répond au hasard.
 */
export const recrutementStep: SubStep = {
  slug: 'recrutement',
  questions: [
    {
      key: 'recruits_for_clients',
      kind: 'single',
      label: 'questions.recruitsForClients.label',
      subtitle: 'questions.recruitsForClients.subtitle',
      choices: [
        { value: 'yes', labelKey: 'questions.recruitsForClients.options.yes' },
        { value: 'no', labelKey: 'questions.recruitsForClients.options.no' },
        { value: 'sometimes', labelKey: 'questions.recruitsForClients.options.sometimes' },
        { value: 'services_only', labelKey: 'questions.recruitsForClients.options.services_only' },
        { value: 'to_develop', labelKey: 'questions.recruitsForClients.options.to_develop' },
      ],
    },
    // #4270.1 (18/10) — le profil d'espace « forfait / conseil » : il réordonne
    // la navigation (le staffing passe au second plan) et lit un besoin comme un
    // projet à cadrer. Réponse ENTREPRISE, modifiable dans Réglages comme les autres.
    {
      key: 'workspace_profile',
      kind: 'single',
      label: 'questions.workspaceProfile.label',
      subtitle: 'questions.workspaceProfile.subtitle',
      choices: [
        { value: 'staffing', labelKey: 'questions.workspaceProfile.options.staffing', iconKey: 'users' },
        {
          value: 'forfait_conseil',
          labelKey: 'questions.workspaceProfile.options.forfait_conseil',
          iconKey: 'briefcase',
        },
      ],
    },
  ],
}
