import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * #2441.11 (épopée #2840) — L'ENVELOPPE QUI MESURE UNE BULLE RENDUE.
 *
 * Un seul rôle : dire à `useMessageWindow` la hauteur RÉELLE de la bulle
 * `index`, à chaque changement — y compris pendant le streaming, où le texte
 * d'une réponse grandit token par token sans que la bulle démonte/remonte
 * (`ResizeObserver` le voit, un callback de ref posé une fois au montage ne le
 * verrait pas). Le premier rendu d'une bulle jamais mesurée utilise une
 * ESTIMATION côté `useMessageWindow` ; celui-ci la remplace dès que possible.
 */
export function MessageWindowItem({
  index,
  onHeight,
  children,
}: {
  index: number
  onHeight: (index: number, height: number) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => onHeight(index, el.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [index, onHeight])

  return <div ref={ref}>{children}</div>
}
