import type { DossierCtaBlockedReason } from '@bellum/contracts'

/**
 * Les empêchements NOMMÉS de la barre d'actions du dossier — #2116.44-47.
 *
 * Trois textes chacun, et les trois sont obligatoires : une raison sans geste
 * de déblocage laisse l'utilisateur devant un bouton gris qu'il ne sait pas
 * quoi faire pour allumer. Ils vivent dans un fichier SANS composant pour que
 * le rechargement à chaud reste net (`react-refresh/only-export-components`).
 */

/** L'offre en cours n'inclut pas les exports. */
export const EXPORTS_NOT_IN_PLAN: DossierCtaBlockedReason = {
  whyKey: 'accounts:cta.blocked.exports.why',
  missingKey: 'accounts:cta.blocked.exports.missing',
  unblockKey: 'accounts:cta.blocked.exports.unblock',
}

/** Écarter un compte sans motif : le serveur refuserait, et l'aller-retour n'apprend rien. */
export const PARK_REASON_REQUIRED: DossierCtaBlockedReason = {
  whyKey: 'accounts:cta.blocked.parkReason.why',
  missingKey: 'accounts:cta.blocked.parkReason.missing',
  unblockKey: 'accounts:cta.blocked.parkReason.unblock',
}
