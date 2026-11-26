import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `outils-invitation` du stage `role` — #2033.8 (D3, décision
 * Louis 18/09/2026) : l'accès aux outils (informationnel) puis la
 * possibilité d'inviter quelqu'un dans l'espace (gate #2033.9 sur
 * `invite_authority`, même échelle que `responsabilites-autorite.ts`).
 *
 * `workspace-team.service.ts:70-73` reste la RÉALITÉ (inviter = `team:manage`,
 * changer un rôle = `owner`) — cette question ne la duplique jamais, elle
 * cadre seulement ce que Laura PROPOSE.
 */
export const outilsInvitationStep: SubStep = {
  slug: 'outils-invitation',
  questions: [
    {
      key: 'tools_access',
      kind: 'multi',
      label: 'questions.toolsAccess.label',
      subtitle: 'questions.toolsAccess.subtitle',
      allowOther: true,
      choices: choice(
        'CRM',
        'ATS / vivier de consultants',
        'Outil de facturation',
        'Messagerie professionnelle',
        'Aucun outil dédié',
      ),
    },
    {
      key: 'invite_authority',
      kind: 'single',
      label: 'questions.inviteAuthority.label',
      subtitle: 'questions.inviteAuthority.subtitle',
      choices: choice('Je décide seul', 'Je dois faire valider', "Je n'ai pas cette responsabilité"),
    },
  ],
}
