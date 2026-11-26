/**
 * ATTENDRE LE PROCHAIN RENDU — sans jamais attendre pour toujours.
 *
 * ⚠️ Le défaut a été mesuré dans le BACK-OFFICE, dont le widget est un portage
 * de celui-ci. Il vit ici depuis le premier jour, à l'identique : le corriger
 * là-bas seulement aurait laissé la version d'origine se figer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * La capture d'écran doit avoir lieu APRÈS que le viseur a quitté le DOM, sinon
 * l'overlay finit dans l'image. On attendait donc deux `requestAnimationFrame`.
 *
 * ⚠️ **`requestAnimationFrame` ne tire JAMAIS dans un onglet caché.** Mesuré en
 * production le 05/09/2026, `document.hidden === true` : le widget restait sur
 * « Capture en cours… » indéfiniment, sans erreur, sans console, sans rien à
 * quoi se raccrocher. Il suffit de changer d'onglet entre le clic et la capture.
 *
 * Un délai fixe ne remplace pas l'attente — sur un onglet visible, deux images
 * arrivent en ~32 ms et il n'y a aucune raison d'attendre plus. La course entre
 * les deux garde le comportement juste quand la page peint, et rend la main
 * quand elle ne peint pas.
 */

/** Au-delà, la page ne peint pas : onglet caché, machine saturée, économiseur. */
const PAINT_TIMEOUT_MS = 400

export function nextPaint(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  return new Promise<void>(resolve => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(finish, PAINT_TIMEOUT_MS)
    requestAnimationFrame(() => requestAnimationFrame(finish))
  })
}
