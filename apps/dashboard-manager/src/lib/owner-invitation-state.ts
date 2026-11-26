import type { AdminOwnerInvitation } from './admin'

/**
 * Ce que la console DIT de l'activation du propriétaire d'un siège
 * provisionné à la main (#2643.2).
 *
 * La décision vit ici, hors du composant (`vitest.config.mts` : environnement
 * `node`) — même gabarit que `esn-profile-state.ts`.
 *
 * ⚠️ TROIS ÉTATS, ET LES DEUX PREMIERS NE SE CONFONDENT PAS. `unavailable`
 * (console neuve, API antérieure à #2643.2 : le champ est absent) et `none`
 * (le compte du propriétaire a été RÉUTILISÉ, rien n'a jamais été préparé)
 * sont deux faits différents — les rendre pareils annoncerait une panne au
 * repos à chaque déploiement.
 */
// Non exportée : seule `describeOwnerInvitation` la nomme.
type OwnerInvitationState = { kind: 'unavailable' } | { kind: 'none' } | ({ kind: 'present' } & AdminOwnerInvitation)

export function describeOwnerInvitation(
  ownerInvitation: AdminOwnerInvitation | null | undefined,
): OwnerInvitationState {
  if (ownerInvitation === undefined) return { kind: 'unavailable' }
  if (ownerInvitation === null) return { kind: 'none' }
  return { kind: 'present', ...ownerInvitation }
}

/**
 * Le refus d'un clic « Envoyer »/« Relancer », en clair — #2643.3 (cadence
 * J+2/J+5) et #2643.1 (lien introuvable, espace inconnu).
 *
 * ⚠️ Un code qu'elle ne connaît pas ressort TEL QUEL, jamais reformulé en
 * « erreur inconnue » : le code réel reste lisible dans l'écran plutôt que
 * d'être avalé par un texte générique.
 */
export function refusalMessage(reason: string | undefined): string {
  if (!reason) return 'Échec de l’envoi.'
  const messages: Record<string, string> = {
    not_found: 'Aucune invitation préparée pour cet espace.',
    no_link: 'Le lien de définition de mot de passe n’a pas pu être engendré.',
    not_due_yet: 'La prochaine relance n’est pas encore due (cadence J+2 / J+5).',
    cadence_exhausted: 'La cadence de relance est épuisée (deux relances déjà envoyées).',
  }
  return messages[reason] ?? reason
}
