import { useCallback, useEffect, useRef, useState } from 'react'

/** Combien de temps l'accusé « Copié » reste affiché, par défaut. */
const DEFAULT_FLASH_MS = 2000

/**
 * L'accusé « Copié », et le minuteur qui le retire — annulé au démontage.
 *
 * Sept endroits écrivaient la même chose à la main :
 *
 * ```ts
 * setCopied(true)
 * setTimeout(() => setCopied(false), 1800)   // jamais annulé
 * ```
 *
 * Aucun ne gardait la poignée du minuteur. Copier puis quitter l'écran avant la
 * fin du délai laissait donc un `setState` s'exécuter sur un composant démonté :
 * en production c'est un avertissement React et un minuteur qui survit à son
 * écran ; en test, l'erreur tombe APRÈS le démontage de l'environnement, et
 * vitest sort en 1 alors que les 423 fichiers de tests sont verts. C'est cette
 * variante-là qui rendait `Test (Web)` intermittent — un échec sans test rouge,
 * donc illisible.
 *
 * Le minuteur est aussi RÉARMÉ à chaque appel : deux copies rapprochées ne
 * laissent plus le premier délai éteindre l'accusé de la seconde.
 *
 * Rend `[copié, montrer, effacer]`. `effacer` sert aux écrans qui retirent
 * l'accusé sur un ÉVÉNEMENT plutôt qu'au bout du délai — la fermeture d'une
 * boîte de dialogue, par exemple : sans lui, un appelant remettrait l'état à
 * faux sans toucher au minuteur, qui le rebasculerait juste après.
 */
export function useCopiedFlash(durationMs: number = DEFAULT_FLASH_MS): [boolean, () => void, () => void] {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  // Le démontage annule. C'est la seule ligne qui manquait aux sept copies.
  useEffect(() => clear, [clear])

  const flash = useCallback(() => {
    clear()
    setCopied(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setCopied(false)
    }, durationMs)
  }, [clear, durationMs])

  const reset = useCallback(() => {
    clear()
    setCopied(false)
  }, [clear])

  return [copied, flash, reset]
}
