/**
 * #3773 — « Tous les exemples » (accueil) ouvre le tiroir des commandes.
 *
 * Le tiroir vit dans le composeur (`commandsOpen`, #2522), frère — pas parent —
 * de la zone des messages qui porte l'accueil. Plutôt que de remonter son état
 * dans `ChatMain` (un fichier central, déjà long), l'accueil EMET une demande et
 * le composeur, qui possède l'état, l'écoute : un seul tiroir, un seul catalogue.
 */
export const OPEN_COMMANDS_EVENT = 'bellum:chat:open-commands'

export function requestOpenCommands(): void {
  window.dispatchEvent(new Event(OPEN_COMMANDS_EVENT))
}
