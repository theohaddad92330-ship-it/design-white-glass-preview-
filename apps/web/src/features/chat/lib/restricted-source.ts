/**
 * #3775.2b — « Partager un lien ne partage pas les identifiants d'un
 * connecteur ; un extrait sensible déjà écrit n'est pas protégé par la
 * fermeture de sa source. »
 *
 * `ia-proxy.controller.ts` (`createChatMessage`, #3775.2b côté serveur) marque
 * `restricted: true` sur chaque source dont la famille correspond à une
 * connexion PERSONNELLE de l'auteur (BEL-INT-604 : une boîte mail est
 * personnelle, jamais visible par un autre membre). `ShareConversation.tsx`
 * lit ce drapeau pour dire, avant de copier le lien, qu'un extrait tiré d'une
 * telle source est peut-être déjà écrit dans le fil — jamais deviné ici,
 * jamais recalculé : ce fichier ne fait que RELIRE ce que le serveur a posé.
 */
type MessageWithSources = {
  context?: { sources?: ReadonlyArray<{ restricted?: boolean }> } | null
}

/** Le fil contient-il au moins une réponse tirée d'une source personnelle ? */
export function hasRestrictedSource(messages: readonly MessageWithSources[]): boolean {
  return messages.some(message => message.context?.sources?.some(source => source.restricted) ?? false)
}
