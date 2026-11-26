import { useEffect, useRef, useState } from 'react'

/**
 * Un bouton flottant s'efface quand on descend, revient quand on remonte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MOTIF PLUTÔT QU'UN AUTRE COIN
 * ─────────────────────────────────────────────────────────────────────────
 * Un bouton ancré en bas à DROITE recouvrait les scores et les montants, qui
 * sont alignés à droite. Déplacé à GAUCHE, il recouvrait les titres, qui sont
 * alignés à gauche. **Aucun coin n'est libre** sur un écran étroit : le contenu
 * occupe toute la largeur, et un élément fixe posé dessus en cache toujours.
 *
 * Le motif standard résout le problème par le TEMPS plutôt que par l'espace :
 * on descend pour LIRE — le bouton s'efface ; on remonte pour AGIR — il revient.
 * Il n'est jamais retiré, et il n'est jamais devant ce qu'on lit.
 *
 * ⚠️ L'écoute est en phase de CAPTURE sur le document, et non sur `window`.
 * Un évènement `scroll` ne remonte pas : sur cette application, la page ne
 * défile pas — c'est un conteneur intérieur qui défile, et un écouteur posé sur
 * `window` ne recevrait jamais rien. La capture, elle, voit tout.
 */
export function useHideOnScroll(): boolean {
  const [hidden, setHidden] = useState(false)
  const previous = useRef<number | null>(null)

  useEffect(() => {
    const onScroll = (event: Event) => {
      const target = event.target
      const top =
        target instanceof HTMLElement ? target.scrollTop : target === document ? window.scrollY : window.scrollY
      if (previous.current === null) {
        previous.current = top
        return
      }
      const delta = top - previous.current
      // Huit pixels de seuil : sans lui, le moindre rebond d'inertie inverse la
      // direction et le bouton clignote.
      if (Math.abs(delta) < 8) return
      previous.current = top
      // Tout en haut, il revient toujours : c'est là qu'on arrive, et un bouton
      // absent à l'ouverture d'un écran passe pour disparu.
      setHidden(delta > 0 && top > 40)
    }

    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
  }, [])

  return hidden
}
