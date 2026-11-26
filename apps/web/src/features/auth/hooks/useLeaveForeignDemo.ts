import { useEffect, useRef } from 'react'
import { isTabDemo } from '@/features/auth/demo-tab'
import { useExitDemo } from '@/features/auth/hooks/useExitDemo'
import { useDemoSpaceStatus } from '@/features/demo/useIsDemo'
import { readImpersonationState } from '@/features/impersonation/impersonation-state'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #5024.2 — suite de #5024 (le cas `/login` est dans `useCloseDemoOnLogin`).
 *
 * Une démo ouverte dans un AUTRE onglet laisse son cookie : un onglet neuf, ouvert sur
 * n'importe quelle page, sans marqueur démo (`demo-tab`, par onglet), se voit servir cette session
 * démo. Le statut serveur dit `demo` alors que CET onglet n'y est pas entré : on en sort, avec le
 * même geste que « Quitter la démonstration » (`useExitDemo`, scope `tab` : une session réelle
 * ouverte à côté survit). On ne fait que SORTIR — jamais entrer dans un espace.
 *
 * Un onglet qui porte le marqueur reste en démo (le prospect qui navigue n'est pas éjecté).
 * `/login` est laissé à `useCloseDemoOnLogin`, qui retient aussi le formulaire.
 */
export function useLeaveForeignDemo(): void {
  const { user } = useSession()
  const demoSpace = useDemoSpaceStatus()
  const { exit } = useExitDemo()
  const startedRef = useRef(false)
  const onLogin = typeof window !== 'undefined' && window.location.pathname === '/login'

  useEffect(() => {
    if (startedRef.current || user === null || onLogin) return
    if (demoSpace !== 'demo' || isTabDemo()) return
    // E2 — l'impersonation admin n'est jamais sortie (Louis 31/10)
    if (readImpersonationState() !== null) return
    startedRef.current = true
    void exit()
  }, [user, demoSpace, onLogin, exit])
}
