/**
 * L'ancre du bloc d'arbitrage des doublons, DÉCLARÉE ICI et nulle part ailleurs.
 *
 * Les bouts du chemin — le contrôle d'hygiène de `/pilotage` qui compte, la
 * redirection de l'ancienne adresse `/pilotage/qualite#hygiene-doublons`, la
 * section « Doublons à trancher » de `/contacts` qui arbitre — passent tous par
 * cette constante. Une clé recopiée à la main d'un côté se décalerait de l'autre
 * sans que rien ne rougisse. Fichier à part du panneau pour que les écrans qui
 * ne font que POINTER vers lui n'en embarquent pas le code.
 */
export const DUPLICATES_ANCHOR_ID = 'hygiene-doublons'
