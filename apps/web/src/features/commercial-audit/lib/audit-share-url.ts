/**
 * #2075.17 — L'URL DE PARTAGE DE L'AUDIT, À UN SEUL ENDROIT (GA-26).
 *
 * `/settings/profile/audit` lit déjà l'audit de l'espace de l'appelant, sans
 * regarder qui a ouvert la page (un seul `esn_profiles` par espace) — même
 * raisonnement que `chatShareUrl` pour le fil du copilote : le bouton ne crée
 * aucun droit, il rend ATTEIGNABLE un écran qu'on ne pouvait désigner
 * qu'oralement. Fixe, sans paramètre : contrairement au fil ou au dossier de
 * compte, il n'y a rien à porter dans l'URL.
 */
export function auditShareUrl(origin: string): string {
  return new URL('/settings/profile/audit', origin).toString()
}
