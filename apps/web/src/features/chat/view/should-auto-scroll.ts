/**
 * #2441.12 — « Conserver le scroll, pas d'auto-scroll si l'utilisateur relit
 * plus haut dans le fil. »
 *
 * Extraite en pur (pas de DOM) parce que jsdom ne calcule jamais de vraie
 * hauteur — un test qui simulerait le scroll dans le conteneur réel serait
 * vert quelle que soit l'implémentation (`sonde-mise-en-page-corpus-vide`).
 * `Chat.tsx` lit `scrollTop`/`scrollHeight`/`clientHeight` du vrai conteneur
 * et passe ces trois nombres ici — c'est CETTE fonction qui décide.
 */
type ScrollBox = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** Distance-au-bas tolérée avant de considérer que la personne a remonté. */
const DEFAULT_THRESHOLD_PX = 80

export function shouldAutoScroll(box: ScrollBox, thresholdPx: number = DEFAULT_THRESHOLD_PX): boolean {
  const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight
  return distanceFromBottom <= thresholdPx
}

/**
 * #1944.20 — symétrique de `shouldAutoScroll`, côté HAUT du fil : la personne
 * a-t-elle assez remonté pour charger les messages plus anciens ? Même
 * conteneur, même seuil par défaut, même raison d'être séparée du DOM.
 */
export function shouldLoadOlderMessages(box: ScrollBox, thresholdPx: number = DEFAULT_THRESHOLD_PX): boolean {
  return box.scrollTop <= thresholdPx
}
