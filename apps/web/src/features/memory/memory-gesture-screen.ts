/**
 * #1946.11 — L'ÉCRAN D'OÙ UNE MÉMOIRE EST POSÉE, à un seul endroit.
 *
 * Trois gestes posent une mémoire aujourd'hui, et les trois vivent sur `/chat` :
 *  - l'épinglage rapide de la barre sous la saisie (`MemoryBar`) ;
 *  - le formulaire complet du panneau (`MemoireCard`), qui n'est monté QUE
 *    depuis la modale de cette barre ;
 *  - « garder cette réponse » dans le fil (`SaveReply`).
 *
 * Réglages › Mémoire (`MemoryLedgerView`) LIT et dépingle, il n'épingle pas —
 * c'est ce qui manquait pour répondre à « le ou les gestes qui posent une
 * mémoire, hors du fil de conversation » : il n'y en a pas.
 *
 * Trois copies de `'/chat'` feraient trois valeurs le jour où un quatrième
 * geste arrive ailleurs (GA-26). Le jour où un écran hors du fil épinglera,
 * c'est LUI qui nommera son écran, et cette constante restera celle du fil.
 */
export const MEMORY_GESTURE_SCREEN = '/chat'

/**
 * Réglages › Laura › Mémoire pose désormais, lui aussi, une mémoire — « Ajouter un élément » (maquette
 * `settings-laura`, N3, Louis 22/10/2026). Il nomme SON écran, comme l'annonçait le commentaire ci-dessus : la
 * constante du fil reste celle du fil.
 */
export const MEMORY_SETTINGS_GESTURE_SCREEN = '/settings/memory'
