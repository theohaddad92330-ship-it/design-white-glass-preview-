/**
 * #1935.20 — UN CONTACT SANS E-MAIL EXIGE UNE CONFIRMATION EXPLICITE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET POURQUOI ÇA NE SUFFISAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `CreateSequenceDialog` affichait déjà un badge « pas d'e-mail » sur la ligne
 * d'un contact — mais RIEN n'empêchait de cliquer « Créer » quand même. Un
 * commercial qui sélectionne vingt lignes d'un coup peut très bien ne pas
 * remarquer un badge au milieu de la liste, et se retrouver avec une séquence
 * dont la première étape (un e-mail) n'a nulle part où partir.
 *
 * Cette porte n'ENVOIE rien — l'étape email d'une séquence prépare déjà un
 * brouillon, jamais un envoi (doctrine « le copilote n'envoie jamais »). Elle
 * arrête seulement le clic « Créer » tant que la personne n'a pas VU et
 * confirmé explicitement qu'elle continue malgré l'absence d'adresse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FONCTION PURE, SÉPARÉE DE L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * La confirmation porte sur un ENSEMBLE de contacts, pas sur un booléen global :
 * ajouter un treizième contact sans e-mail après avoir confirmé les douze
 * premiers doit rouvrir la question, sinon la confirmation se périme en
 * silence. `noEmailContactIds` et `needsNoEmailConfirmation` sont donc les deux
 * seules fonctions qui décident quoi que ce soit ici — l'écran ne fait que les
 * appeler.
 */

type ContactLike = { id: string; email: string | null }

/** Les identifiants des contacts SANS e-mail dans la sélection courante. */
export function noEmailContactIds(chosen: readonly ContactLike[]): string[] {
  return chosen.filter(contact => !contact.email).map(contact => contact.id)
}

/**
 * Le clic « Créer » doit-il s'arrêter sur une confirmation ?
 *
 * Vrai dès qu'AU MOINS un contact sans e-mail de la sélection courante n'a pas
 * été confirmé — ajouter un nouveau contact sans e-mail après une première
 * confirmation redemande donc la confirmation, sur celui-ci en particulier.
 */
export function needsNoEmailConfirmation(chosen: readonly ContactLike[], confirmedIds: ReadonlySet<string>): boolean {
  return chosen.some(contact => !contact.email && !confirmedIds.has(contact.id))
}
