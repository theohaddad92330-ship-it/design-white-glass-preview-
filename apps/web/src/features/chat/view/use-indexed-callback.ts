import { useCallback, useRef } from 'react'

/**
 * #2441.11 — CALLBACKS STABLES PAR INDEX pour une liste de messages.
 *
 * Le défaut mesuré (`Chat.tsx:2888`, `messages.map`) : chaque bulle reçoit
 * `onRetry={() => onRetryReply(index)}` — une closure NEUVE à chaque render
 * du parent, pour les 1000 bulles, à chaque token streamé. Un `React.memo`
 * posé sur la bulle n'a alors AUCUN effet : ses props changent toujours.
 *
 * Ce hook rend, pour un `index` donné, TOUJOURS la même référence de fonction
 * d'un render à l'autre — la condition nécessaire pour qu'un `React.memo`
 * évite de rerendre une bulle dont le contenu n'a pas changé. Le handler
 * sous-jacent peut lui-même changer de render en render (cas courant d'un
 * callback défini inline dans le composant parent) : cette fonction lit
 * toujours la version la PLUS RÉCENTE via une ref, jamais une closure figée.
 *
 * `resetKey` vide le cache quand il change (ex. changement de conversation) :
 * sans ça, le cache grandirait sans borne sur une session longue avec
 * beaucoup de fils successifs.
 */
export function useIndexedCallback<Args extends unknown[] = []>(
  handler: (index: number, ...args: Args) => void,
  resetKey?: unknown,
): (index: number) => (...args: Args) => void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const cacheRef = useRef(new Map<number, (...args: Args) => void>())
  const resetKeyRef = useRef(resetKey)
  if (resetKeyRef.current !== resetKey) {
    resetKeyRef.current = resetKey
    cacheRef.current = new Map()
  }

  return useCallback((index: number) => {
    const cache = cacheRef.current
    let fn = cache.get(index)
    if (!fn) {
      fn = (...args: Args) => handlerRef.current(index, ...args)
      cache.set(index, fn)
    }
    return fn
  }, [])
}
