import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { computeVirtualWindow } from './message-list-window'

/**
 * #2441.11 (épopée #2840) — LE CÂBLAGE RÉEL DE LA VIRTUALISATION DANS L'ÉCRAN.
 *
 * `computeVirtualWindow` (pur, testé en isolation dans `message-list-window.
 * test.ts`) décide QUELS indices monter à partir de hauteurs et d'un scroll —
 * il ne mesure rien lui-même. Ce hook lui fournit les deux mesures RÉELLES :
 *
 *  - le `clientHeight`/`scrollTop` du VRAI conteneur scrollable, lus sur le
 *    nœud DOM (`ResizeObserver` pour les redimensionnements, un écouteur de
 *    scroll pour le défilement) — jamais simulés ;
 *  - une hauteur MESURÉE par message déjà rendu (`registerHeight`, appelé par
 *    l'écran depuis un `ResizeObserver` posé sur chaque bulle — voir
 *    `MessageWindowItem`). Un message qui n'a jamais été monté garde une
 *    hauteur ESTIMÉE : `computeVirtualWindow` documente déjà cette distinction
 *    (« mesurée si connue, estimée sinon »).
 *
 * ⚠️ CONTENEUR PAS ENCORE MESURÉ — le cas de TOUS les rendus avant la première
 * mise en page (et de TOUS les tests `render(<Chat />)` : jsdom ne calcule
 * aucune vraie hauteur, `clientHeight` y vaut 0). Un viewport à 0 ferait lire
 * `computeVirtualWindow` comme « rien ne tient », donc UN SEUL message monté —
 * un flash de contenu vide pire qu'un rendu non virtualisé le temps d'une
 * mesure. Ce hook traite un `clientHeight` de 0 comme « pas encore mesuré » et
 * ouvre la fenêtre en entier, jusqu'à la première mesure réelle.
 */

/** Hauteur d'une bulle jamais encore rendue — une estimation, pas une mesure. */
const ESTIMATED_MESSAGE_HEIGHT_PX = 96

type MessageVirtualWindow = ReturnType<typeof computeVirtualWindow>

export function useMessageWindow(
  containerRef: RefObject<HTMLElement | null>,
  itemCount: number,
  resetKey?: unknown,
): {
  window: MessageVirtualWindow
  /** Hauteurs utilisées pour CE calcul — mesurées ou estimées, une par message. */
  itemHeights: readonly number[]
  /** À passer à `MessageWindowItem` (ou appeler soi-même) pour chaque index rendu. */
  registerHeight: (index: number, height: number) => void
} {
  const heightsRef = useRef<number[]>([])
  const resetKeyRef = useRef(resetKey)
  if (resetKeyRef.current !== resetKey) {
    resetKeyRef.current = resetKey
    heightsRef.current = []
  }

  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [heightsVersion, setHeightsVersion] = useState(0)

  useLayoutEffect(() => {
    const box = containerRef.current
    if (!box) return
    const measure = () => {
      setViewportHeight(box.clientHeight)
      setScrollTop(box.scrollTop)
    }
    measure()
    const onScroll = () => setScrollTop(box.scrollTop)
    box.addEventListener('scroll', onScroll, { passive: true })
    if (typeof ResizeObserver === 'undefined') {
      return () => box.removeEventListener('scroll', onScroll)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => {
      box.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current])

  const registerHeight = useCallback((index: number, height: number) => {
    if (height > 0 && heightsRef.current[index] !== height) {
      heightsRef.current[index] = height
      setHeightsVersion(v => v + 1)
    }
  }, [])

  const itemHeights = useMemo(
    () => Array.from({ length: itemCount }, (_, index) => heightsRef.current[index] ?? ESTIMATED_MESSAGE_HEIGHT_PX),
    // `heightsVersion` déclenche le recalcul quand une hauteur MESURÉE change ;
    // `heightsRef` lui-même n'est jamais une dépendance (une ref ne varie pas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemCount, heightsVersion],
  )

  const window = useMemo(
    () =>
      computeVirtualWindow({
        itemHeights,
        scrollTop,
        viewportHeight: viewportHeight > 0 ? viewportHeight : Number.POSITIVE_INFINITY,
      }),
    [itemHeights, scrollTop, viewportHeight],
  )

  return { window, itemHeights, registerHeight }
}
