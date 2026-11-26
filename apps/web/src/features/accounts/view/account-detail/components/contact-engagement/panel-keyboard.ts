/**
 * #3696.7 — le panneau de préparation se referme au clavier, comme il s'ouvre.
 *
 * « Échap » ferme le panneau — et RIEN d'autre : ni un menu déroulant ouvert
 * depuis le panneau (il se rend dans un portail, hors du DOM du panneau : sa
 * touche lui appartient), ni une composition de saisie (IME), ni un événement
 * déjà consommé. Fermer n'envoie rien et ne jette rien (#3696.4).
 */
export function closesPanelOnKey(
  event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'isComposing'>,
  inPanel: boolean,
): boolean {
  return event.key === 'Escape' && inPanel && !event.defaultPrevented && !event.isComposing
}
