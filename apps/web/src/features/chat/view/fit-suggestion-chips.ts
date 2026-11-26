import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/** Écart entre pastilles : `gap-1.5` (0,375 rem à 16 px). */
const CHIP_GAP_PX = 6

/**
 * #4594 — combien de pastilles tiennent ENTIÈRES dans `available` px.
 * Une pastille qui ne tient pas de quelques pixels est retirée : on montre
 * moins, jamais une pastille tronquée.
 */
export function countWholeChips(widths: number[], gap: number, available: number): number {
  let used = 0
  let count = 0
  for (const width of widths) {
    const next = used + (count > 0 ? gap : 0) + width
    if (next > available) break
    used = next
    count += 1
  }
  return count
}

/**
 * Mesure la largeur RÉELLE des pastilles (`[data-chip]`) et de la rangée qui
 * les porte, et dit combien en montrer. Les pastilles masquées (`hidden`)
 * n'ont plus de largeur : leurs mesures sont gardées d'une passe à l'autre.
 * Les enfants de la rangée qui ne sont pas des pastilles (le lanceur
 * d'exemples) retirent leur place de la rangée.
 */
export function useFittedChipCount(chipCount: number, active = true) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const measured = useRef<number[]>([])
  /** #4594.1 — le libellé pour lequel chaque largeur a été prise : un autre libellé = une autre largeur. */
  const measuredLabels = useRef<string[]>([])
  const [visibleCount, setVisibleCount] = useState(chipCount)

  const measure = useCallback(() => {
    const row = containerRef.current
    if (!row) return
    const chips = Array.from(row.querySelectorAll<HTMLElement>('[data-chip]'))
    chips.forEach((chip, index) => {
      const label = chip.textContent ?? ''
      // #4594.1 — même nombre de pastilles mais libellé changé (autre fil, autre compte) : la largeur gardée est fausse.
      if (measuredLabels.current[index] !== label) {
        delete measured.current[index]
        measuredLabels.current[index] = label
      }
      if (chip.offsetWidth > 0) measured.current[index] = chip.offsetWidth
    })
    const widths = chips.map((_, index) => measured.current[index])
    // Une pastille jamais mesurée : on ne devine pas, on les montre toutes pour la mesurer.
    if (widths.some(width => width === undefined)) {
      setVisibleCount(chipCount)
      return
    }
    const others = Array.from(row.children).filter(
      child => !(child as HTMLElement).hasAttribute('data-chip') && (child as HTMLElement).offsetWidth > 0,
    ) as HTMLElement[]
    const reserved = others.reduce((sum, child) => sum + child.offsetWidth + CHIP_GAP_PX, 0)
    setVisibleCount(countWholeChips(widths, CHIP_GAP_PX, row.clientWidth - reserved))
  }, [chipCount])

  useLayoutEffect(() => {
    measured.current = []
    measuredLabels.current = []
    setVisibleCount(chipCount)
  }, [chipCount])

  // #4594.1 — sans tableau de dépendances : un libellé qui change à nombre égal doit relancer la mesure.
  useLayoutEffect(() => {
    if (!active) return
    const row = containerRef.current
    if (!row) return
    const chips = Array.from(row.querySelectorAll<HTMLElement>('[data-chip]'))
    const labels = chips.map(chip => chip.textContent ?? '')
    // Une pastille rendue visible (donc mesurable) mais jamais mesurée : on la mesure maintenant.
    const unmeasured = chips.some((chip, index) => measured.current[index] === undefined && chip.offsetWidth > 0)
    if (unmeasured) {
      measure()
      return
    }
    if (labels.some((label, index) => measuredLabels.current[index] !== label)) measure()
  })

  useLayoutEffect(() => {
    if (!active) return
    measure()
    const row = containerRef.current
    // #4594.1 — la police web arrive après la 1re mesure : les largeurs prises avant sont trop courtes.
    void document.fonts?.ready?.then(measure)
    if (!row || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    return () => observer.disconnect()
  }, [measure, active])

  return { containerRef, visibleCount }
}
