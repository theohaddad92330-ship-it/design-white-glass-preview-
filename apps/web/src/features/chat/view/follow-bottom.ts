/**
 * #3551 — amène le fil sur son dernier message. Deux passes : la hauteur lue tout de suite
 * ignore la bulle neuve tant que la fenêtre virtuelle (`useMessageWindow`) ne l'a pas
 * mesurée ; la seconde, à l'image suivante, rattrape. Affectation de `scrollTop` et non
 * défilement doux : voir `Chat.scroll.test.ts`.
 */
export function followBottom(
  box: HTMLElement,
  schedule: (callback: () => void) => unknown = callback => requestAnimationFrame(callback),
): void {
  box.scrollTop = box.scrollHeight
  schedule(() => {
    box.scrollTop = box.scrollHeight
  })
}
