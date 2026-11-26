import { useEffect, useState } from 'react'

/**
 * #2435.5 — LA HAUTEUR DU CLAVIER VIRTUEL, MESURÉE SUR LE VIEWPORT VISUEL.
 *
 * `dvh` (déjà la règle du dépôt, GA-29) suit la barre d'adresse mobile, mais
 * pas TOUJOURS le clavier — le comportement diverge selon navigateur et
 * version (Safari iOS redimensionne le viewport visuel sans toucher au
 * viewport de mise en page ; Chrome Android varie selon
 * `interactive-widget`). `window.visualViewport` est l'API pensée pour ça :
 * il rétrécit quand le clavier s'ouvre, `window.innerHeight` non — la
 * différence EST la hauteur qu'occupe le clavier.
 *
 * Repli à `0` sans `visualViewport` (navigateur ancien, ou jsdom en test) :
 * jamais un clavier inventé.
 */
export function useVisualViewportInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      const next = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setInset(next)
    }

    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    update()
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
