/**
 * #3050 (27/09/2026) — LA MÊME RÈGLE, DEUX APPELANTS.
 *
 * `FeedbackWidget` se tait sur /chat mobile (voir son propre docblock : la
 * saisie de Laura y est pleine largeur, le bouton flottant recouvrait
 * « Envoyer »). `CustomerPageContent` réserve, sous 768px, une marge basse
 * après le contenu pour ne JAMAIS finir sous ce bouton (#2117.84) — sauf que
 * la marge restait posée même sur l'écran où le bouton s'est tu depuis,
 * mangeant 64px sur un copilote qui gère déjà tout son propre défilement.
 * Recette du 27/09/2026 (fenêtre 500px) : le fil n'occupait plus que 38% de
 * la hauteur utile, 325px s'empilaient sous le composeur.
 *
 * Un SEUL prédicat pour la route où ce bouton se tait : deux lectures de la
 * même route qui divergent redeviendraient un bug le jour où l'une des deux
 * change seule (GA-26).
 */
export function isFeedbackWidgetHiddenOnMobilePath(pathname: string): boolean {
  return pathname === '/chat' || pathname.startsWith('/chat/')
}
