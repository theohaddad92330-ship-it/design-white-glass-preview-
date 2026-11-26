/**
 * #1674.9 — le seuil des trois paliers de largeur, à UN seul endroit.
 *
 * Il vit dans un fichier à part, sans `'use client'` ni JSX, pour que la garde
 * d'architecture puisse le lire sans monter React — et pour qu'il ne puisse pas
 * être recopié en dur dans un `@media` d'un côté et un `matchMedia` de l'autre :
 * deux écritures du même réglage divergent toujours.
 */
export const SEUIL_POSTE_DE_TRAVAIL_PX = 768
