'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type ElementPickerProps = {
  onPick: (element: Element, rect: DOMRect) => void
  onSkip: () => void
  onCancel: () => void
}

/**
 * `name` n'arrive JAMAIS à l'écran — le cadre de survol est le seul repère
 * visuel. Il existe pour qu'un lecteur d'écran, qui ne voit pas ce cadre,
 * apprenne quand même ce que le curseur survole. C'est le nom accessible de
 * l'élément, jamais un chemin de source.
 */
type Hover = { rect: DOMRect; name: string }

/**
 * LE VISEUR — porté de l'application cliente.
 *
 * On pointe ce qui est cassé et on récupère le nœud DOM exact. L'overlay AVALE
 * le clic : rien dans la console ne navigue ni ne modifie quoi que ce soit
 * pendant qu'on signale — sur un back-office qui porte des boutons
 * « Incarner », « Déconnecter » ou « Créer un client », ce n'est pas un détail
 * de confort.
 *
 * ⚠️ Tout ce qui porte `data-bellum-capture-ignore` est traversé : le viseur
 * doit atteindre la page SOUS lui, et la capture d'écran ne doit pas montrer le
 * rapporteur.
 */
export function ElementPicker({ onPick, onSkip, onCancel }: ElementPickerProps) {
  const [hover, setHover] = useState<Hover | null>(null)
  const targetRef = useRef<Element | null>(null)

  const elementAt = useCallback((x: number, y: number): Element | null => {
    const stack = document.elementsFromPoint(x, y)
    return stack.find(node => !node.closest('[data-bellum-capture-ignore]')) ?? null
  }, [])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const element = elementAt(event.clientX, event.clientY)
      targetRef.current = element
      if (!element) return setHover(null)
      setHover({ rect: element.getBoundingClientRect(), name: accessibleName(element) })
    }

    const onClick = (event: MouseEvent) => {
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
    <div data-bellum-capture-ignore="" className="picker-layer">
      {/*
        Le cadre est le SEUL retour visuel pendant le pointage : il doit se lire
        sur les deux thèmes. Le violet seul disparaît sur le fond sombre, d'où le
        liseré clair intérieur — l'un des deux contraste toujours avec ce qu'il y
        a derrière.
      */}
      {hover ? (
        <div
          aria-hidden="true"
          data-testid="picker-highlight"
          className="picker-box"
          style={{ top: hover.rect.y, left: hover.rect.x, width: hover.rect.width, height: hover.rect.height }}
        />
      ) : null}

      {/*
        Ce que les voyants lisent dans le cadre, dit en mots. Un nom qu'un humain
        reconnaît, jamais un sélecteur ni un chemin de source — l'identité
        technique voyage à part, dans l'issue.
      */}
      <p role="status" aria-live="polite" className="picker-sr">
        {hover ? `Survol : ${hover.name}` : 'Clique sur ce qui ne va pas.'}
      </p>

      <div className="picker-bar-wrap">
        <div className="picker-bar">
          <span>Clique sur ce qui ne va pas.</span>
          <button type="button" className="picker-skip" onClick={onSkip}>
            Passer
          </button>
          <button type="button" className="picker-close" aria-label="Annuler" onClick={onCancel}>
            ✕
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const MAX_NAME = 80

/**
 * Ce qu'un humain appellerait cette chose : son libellé, son texte visible, ou
 * à défaut sa balise. Annoncé aux seuls lecteurs d'écran. Rien n'est inventé
 * quand l'élément n'a pas de nom.
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
