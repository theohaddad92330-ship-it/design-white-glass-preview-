import { useEffect, useRef, useState } from 'react'
import { clearVolatileUserState } from '@/features/auth/clear-client-user-state'
import { isTabDemo } from '@/features/auth/demo-tab'
import { endVoluntaryExit } from '@/features/auth/lib/pre-login-target'
import { sessionManager } from '@/features/auth/session-manager'
import { useDemoSpaceStatus } from '@/features/demo/useIsDemo'
import { useSession } from '@/lib/hooks/use-session'

/**
 * /login ferme la session de démonstration AVANT d'ouvrir la vraie (#3788).
 *
 * Recette du 06/10/2026 : entré en salle démo par `/demo/acces`, puis `/login`
 * + « Se connecter » → on retombait dans la démo (utilisateur fictif, bandeau
 * MODE DÉMO). La session démo est une vraie session serveur (cookie + identité
 * d'onglet) : tant qu'on ne la ferme pas, `useRedirectAfterAuth` voit un
 * utilisateur et rebondit dedans sans attendre les identifiants. Il fallait
 * « Quitter la démonstration » d'abord.
 *
 * Même sortie que le bandeau (`useExitDemo`) — déconnexion explicite, cache
 * vidé, repère de sortie volontaire levé — sans navigation : on est déjà sur
 * `/login`. Jamais deux identités mêlées.
 *
 * Déclenchent : le marqueur d'onglet démo, OU le serveur qui dit `is_demo` de la
 * session posée (#5024). Un vrai compte qui visite `/login` n'est jamais
 * déconnecté par ce hook.
 *
 * #5024 — régression de #3788 (retour client du 29/10/2026) : le marqueur est
 * par onglet (`sessionStorage`). Une démo ouverte dans un AUTRE onglet laisse
 * son cookie ; cet onglet-ci, sans marqueur ni identité, se voit servir la
 * session démo par le serveur, et le rebond post-connexion repartait dedans.
 * Le statut serveur décide donc, quel que soit l'onglet ; tant qu'il est
 * inconnu, `checking` retient le rebond (et le formulaire). La fermeture ne
 * vise que l'identité de CET onglet (`scope: 'tab'`, #4608) : une session
 * réelle ouverte à côté survit.
 *
 * #3788.6 — même raison que `useExitDemo` : `qc.clear()` seul ne vide pas le
 * scroll infini des comptes et des contacts, persisté en localStorage hors de
 * portée de react-query. `clearVolatileUserState` est le mécanisme unique.
 */
export function useCloseDemoOnLogin(): { closing: boolean; checking: boolean } {
  const { user } = useSession()
  const demoSpace = useDemoSpaceStatus()
  const startedRef = useRef(false)
  const [done, setDone] = useState(false)
  const tabDemo = isTabDemo()
  // #5024 — le serveur dit démo : on ferme même sans le marqueur de cet onglet.
  const needsClose = user !== null && (tabDemo || demoSpace === 'demo') && !done
  // #5024 — le serveur n'a pas encore dit si la session posée est une démo : on ne rebondit pas encore.
  const checking = user !== null && !needsClose && !done && demoSpace === 'unknown'

  useEffect(() => {
    if (!needsClose || startedRef.current) return
    startedRef.current = true
    void (async () => {
      try {
        // Le marqueur d'onglet garde la sortie de #3788 ; #5024 / #4608 — détectée par le seul
        // serveur, la salle est fermée pour CET onglet seulement.
        await (tabDemo ? sessionManager.logout() : sessionManager.logout({ scope: 'tab' }))
      } catch {
        // Le serveur peut refuser : l'état local est nettoyé quoi qu'il arrive.
      }
      clearVolatileUserState()
      endVoluntaryExit()
      setDone(true)
    })()
  }, [needsClose, tabDemo])

  return { closing: needsClose, checking }
}
