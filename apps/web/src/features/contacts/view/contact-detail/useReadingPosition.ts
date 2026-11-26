import { useEffect } from 'react'

const keyFor = (id: string) => `bellum:scroll:${id}`

/**
 * #3688.10 — la POSITION DE LECTURE se retrouve : quitter la fiche (ouvrir un
 * message, un compte) puis revenir ramène là où on lisait, pas en haut.
 *
 * Mémoire de session seulement (jamais envoyée nulle part) et jamais bloquante :
 * un stockage refusé veut dire « pas de mémoire », pas une erreur. `enabled`
 * se désactive quand une ancre est demandée (`?tab=`) — elle gagne.
 */
export function useReadingPosition(id: string, enabled = true) {
  useEffect(() => {
    const key = keyFor(id)
    const save = () => {
      try {
        if (window.scrollY > 0) window.sessionStorage.setItem(key, String(Math.round(window.scrollY)))
        else window.sessionStorage.removeItem(key)
      } catch {
        // pas de mémoire : la fiche marche pareil
      }
    }
    if (enabled) {
      try {
        const saved = Number(window.sessionStorage.getItem(key))
        if (Number.isFinite(saved) && saved > 0) {
          window.requestAnimationFrame(() => window.scrollTo({ top: saved }))
        }
      } catch {
        // idem
      }
    }
    window.addEventListener('pagehide', save)
    return () => {
      window.removeEventListener('pagehide', save)
      save()
    }
  }, [id, enabled])
}
