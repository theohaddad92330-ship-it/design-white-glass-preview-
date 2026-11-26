import { useCallback, useState } from 'react'

const STORAGE_KEY = 'bellum.contacts.compact'

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Théo B c1-repertoire.N1 — « Compacter la liste » : une préférence d'affichage par utilisateur, front seul.
 * Le stockage peut être absent ou refusé (fenêtre privée) : l'écran reste juste, le choix tient alors pour la session.
 */
export function useCompactContactsList() {
  const [compact, setCompactState] = useState(readStored)
  const setCompact = useCallback((next: boolean) => {
    setCompactState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* préférence non conservée : la liste reste compacte pour cette session */
    }
  }, [])
  return { compact, setCompact }
}
