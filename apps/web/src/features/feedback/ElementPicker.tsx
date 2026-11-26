import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Crosshair, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type ElementPickerProps = {
  onPick: (element: Element, rect: DOMRect) => void
  onSkip: () => void
  onCancel: () => void
}

/**
 * `name` never reaches the screen — the highlight box is the only visual cue.
 * It exists so screen-reader users, who cannot see that box, still learn what
 * the cursor is over. It is the element's accessible name, never a source path.
 */
type Hover = { rect: DOMRect; name: string }

/**
 * Crosshair overlay: the user points at whatever is broken and we hand back the
 * exact DOM node. The overlay itself swallows the click so nothing in the app
 * navigates or mutates while reporting.
 */
export function ElementPicker({ onPick, onSkip, onCancel }: ElementPickerProps) {
  const { t } = useTranslation('feedback')
  const [hover, setHover] = useState<Hover | null>(null)
  const targetRef = useRef<Element | null>(null)

  const elementAt = useCallback((x: number, y: number): Element | null => {
    // Skip our own chrome (the overlay, the hint bar) to reach the app below.
    const stack = document.elementsFromPoint(x, y)
    return stack.find(node => !node.closest('[data-bellum-capture-ignore]')) ?? null
  }, [])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const element = elementAt(event.clientX, event.clientY)
      targetRef.current = element
      if (!element) return setHover(null)
      const rect = element.getBoundingClientRect()
      setHover({ rect, name: accessibleName(element) })
    }

    const onClick = (event: MouseEvent) => {
      // #1792 (bug trouvé en chemin, 09/09) — cette capture avalait TOUT clic,
      // y compris ceux qui visent le chrome du picker lui-même (« Sans
      // pointer », le bouton d'annulation) : `stopPropagation()` tombait avant
      // de savoir où le clic allait, donc le clic n'atteignait jamais le
      // `onClick` React de son PROPRE bouton. On ne coupe la propagation que
      // pour un clic qui vise réellement l'app en dessous.
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-bellum-capture-ignore]')) return

      event.preventDefault()
      event.stopPropagation()
      const element = elementAt(event.clientX, event.clientY) ?? targetRef.current
      if (element) onPick(element, element.getBoundingClientRect())
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'crosshair'

    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.cursor = previousCursor
    }
  }, [elementAt, onCancel, onPick])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div data-bellum-capture-ignore="" className="pointer-events-none fixed inset-0 z-picker">
      {/*
        The highlight box is the ONLY visual feedback during picking, so it has
        to read on both themes. The violet border alone is too dark against the
        dark-mode background, so it is sandwiched between a light inner hairline
        and a violet outer glow — one of the two always contrasts with whatever
        is behind it.
      */}
      {hover && (
        <div
          aria-hidden="true"
          data-testid="feedback-highlight"
          className="absolute rounded-sm border-2 border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)]/15 transition-[top,left,width,height] duration-75"
          style={{
            top: hover.rect.y,
            left: hover.rect.x,
            width: hover.rect.width,
            height: hover.rect.height,
            boxShadow: [
              'inset 0 0 0 1px rgba(255,255,255,0.75)',
              '0 0 0 1px rgba(255,255,255,0.55)',
              '0 0 0 5px color-mix(in srgb, var(--bellum-primary-500) 40%, transparent)',
            ].join(', '),
          }}
        />
      )}

      {/*
        Screen readers get in words what sighted users get from the box. This
        replaces the technical chip that used to sit above the highlight: an
        accessible name a human recognises, never a selector or a source path.
      */}
      <p role="status" aria-live="polite" aria-label={t('picker.hoverRegion')} className="sr-only">
        {hover ? t('picker.hovering', { element: hover.name }) : t('picker.hint')}
      </p>

      <div
        className="pointer-events-auto absolute inset-x-0 top-4 flex justify-center"
        // #2487 — cette barre est portée par SON PROPRE portail, hors du
        // contenu de la modale qu'on pointe : sans ceci, le `DismissableLayer`
        // de cette modale voit le `pointerdown` sur « Sans pointer »/« Annuler »
        // comme EXTÉRIEUR à son contenu et la referme, même chose que le
        // déclencheur du widget (voir `FeedbackWidget.tsx`). `pointerdown`
        // précède `click` — le `stopPropagation` déjà posé sur `click` plus
        // bas (ligne ~55) arrive trop tard pour l'empêcher.
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-2 text-sm text-[var(--bellum-text-primary)] shadow-lg">
          <Crosshair className="size-4 text-[var(--bellum-text-accent)]" />
          <span>{t('picker.hint')}</span>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-[var(--bellum-border)] px-2.5 py-1 text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
          >
            {t('picker.skip')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('common:actions.cancel')}
            className="rounded-full p-1 text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-2)]"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const MAX_NAME = 80

/**
 * What a person would call this thing — its label, its visible text, or failing
 * both its tag name. Announced to screen readers only. The technical identity
 * (selector, classes, `data-bellum-src` line) is collected separately by
 * `buildElementContext` and travels to the GitHub issue; it is never surfaced
 * here, and nothing is invented when the element has no name of its own.
 */
function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label')?.trim()
  if (label) return truncate(label)

  const alt = element.getAttribute('alt')?.trim()
  if (alt) return truncate(alt)

  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text) return truncate(text)

  return element.tagName.toLowerCase()
}

function truncate(value: string): string {
  return value.length > MAX_NAME ? `${value.slice(0, MAX_NAME)}…` : value
}
