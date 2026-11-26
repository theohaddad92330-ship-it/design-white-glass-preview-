'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import styles from './guided-tour.module.css'
import { buildTourSteps, clampStepIndex, type TourSectionLike, type TourTextKey } from './guided-tour.logic'

/**
 * #1678.2 — LA VISITE GUIDÉE, section par section. Montée UNE FOIS dans
 * `layout.tsx` (donc disponible sur toute page), déclenchée par le bouton du
 * rail ou par `TourTrigger` sur `/runbook`, via `openGuidedTour()` — même motif
 * d'événement DOM que `global-search.tsx` (deux enfants indépendants du layout
 * racine, aucun état commun à faire remonter).
 *
 * ⚠️ NE NAVIGUE JAMAIS : elle entoure chaque section du rail sur la page
 * COURANTE (voir le docblock de `guided-tour.logic.ts`). Suivre un lien du
 * rail pendant la visite la ferme — un `<a href>` plein est une navigation
 * complète, qui perdrait l'état React de toute façon.
 *
 * ⚠️ NE S'AUTO-LANCE PAS au premier chargement. « Déclenchable » (#1678.2) est
 * tenu par le bouton du rail + celui de `/runbook` ; un auto-lancement pour
 * « nouvel opérateur » demanderait de savoir QUI est nouveau (un signal que la
 * console n'a pas aujourd'hui) et risquerait de s'imposer à un opérateur
 * expérimenté à chaque nettoyage de `localStorage`. Décision de scope
 * explicite, pas un oubli.
 */

const OPEN_EVENT = 'bellum:guided-tour:open'

export function openGuidedTour(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export type GuidedTourLabels = Record<TourTextKey, string> & {
  stepLabel: string
  next: string
  prev: string
  skip: string
  finish: string
  close: string
}

export function GuidedTour({ sections, labels }: { sections: TourSectionLike[]; labels: GuidedTourLabels }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const steps = buildTourSteps(sections)
  const stepIndex = clampStepIndex(index, steps.length)
  const step = steps[stepIndex]

  useEffect(() => {
    function onOpenEvent(): void {
      setIndex(0)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpenEvent)
    return () => window.removeEventListener(OPEN_EVENT, onOpenEvent)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  // L'anneau de focus ne se supprime jamais sans remplacement.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      panelRef.current?.focus()
    } else {
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // Échap ferme toute modale.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // Mesure la cible de l'étape courante, et la RE-mesure sur resize/scroll —
  // le rail peut se replier/déplier pendant la visite.
  useEffect(() => {
    if (!open || !step.targetSelector) {
      setRect(null)
      return
    }
    const selector = step.targetSelector
    function measure(): void {
      const el = document.querySelector(selector)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, step])

  if (!open) return null

  const isFirst = stepIndex <= 0
  const isLast = stepIndex >= steps.length - 1

  const panelStyle: CSSProperties = rect
    ? {
        top: Math.min(rect.bottom + 12, window.innerHeight - 220),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)),
      }
    : { top: '20vh', left: '50%', transform: 'translateX(-50%)' }

  return (
    <div className={styles['overlay']}>
      {rect ? (
        <div
          className={styles['spotlight']}
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : null}

      <div
        ref={panelRef}
        className={styles['panel']}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={labels[step.titleKey]}
        tabIndex={-1}
      >
        <p className={styles['stepCount']}>
          {labels.stepLabel} {stepIndex + 1} / {steps.length}
        </p>
        <h2 className={styles['title']}>{labels[step.titleKey]}</h2>
        <p className={styles['body']}>{labels[step.bodyKey]}</p>
        <div className={styles['actions']}>
          <button type="button" className={styles['ghost']} onClick={close}>
            {labels.skip}
          </button>
          <div className={styles['navGroup']}>
            <button
              type="button"
              className={styles['ghost']}
              disabled={isFirst}
              onClick={() => setIndex(i => clampStepIndex(i - 1, steps.length))}
            >
              {labels.prev}
            </button>
            <button
              type="button"
              className={styles['primary']}
              onClick={() => (isLast ? close() : setIndex(i => clampStepIndex(i + 1, steps.length)))}
            >
              {isLast ? labels.finish : labels.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
