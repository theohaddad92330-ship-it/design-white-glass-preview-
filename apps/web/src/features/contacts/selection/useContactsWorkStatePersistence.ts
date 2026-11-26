import { useEffect, useRef } from 'react'
import { contactsWorkState } from './contactsWorkState'
import { isDetailPath } from './isDetailPath'

/**
 * #3713.9 — rend à la liste sa sélection et sa position au retour d'une fiche.
 * La sélection est lue UNE fois à la création (`readInitialSelection`) puis le
 * magasin est vidé : elle vit dans l'état du composant. À la sortie vers une
 * fiche seulement, sélection et défilement y sont reposés. Position rendue
 * quand les lignes sont là (`ready`), une seule fois.
 */
export function readInitialSelection<T extends { id: string }>(): {
  selected: ReadonlyMap<string, T>
  scrollY: number | null
} {
  const saved = contactsWorkState.read<T>()
  contactsWorkState.reset()
  return saved
}

export function useContactsWorkStatePersistence<T extends { id: string }>(
  selected: ReadonlyMap<string, T>,
  restoredScrollY: number | null,
  ready: boolean,
) {
  const selectedRef = useRef(selected)
  const scrollRef = useRef(0)
  selectedRef.current = selected
  useEffect(() => {
    const onScroll = () => {
      scrollRef.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (isDetailPath(window.location.pathname)) {
        contactsWorkState.save({ selected: selectedRef.current, scrollY: scrollRef.current })
      }
    }
  }, [])
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!ready || restoredRef.current || restoredScrollY === null) return
    restoredRef.current = true
    window.scrollTo(0, restoredScrollY)
  }, [ready, restoredScrollY])
}
