import { useCallback, useState } from 'react'
import { clearVolatileUserState } from '@/features/auth/clear-client-user-state'
import { endVoluntaryExit } from '@/features/auth/lib/pre-login-target'
import { takePreDemoIdentity } from '@/features/auth/pre-demo-identity'
import { sessionManager } from '@/features/auth/session-manager'
import { rememberTabIdentity } from '@/features/auth/tab-identity'

/**
 * « Quitter la démonstration » — un seul clic, une sortie DÉTERMINISTE.
 *
 * Constat de recette du 29/09/2026 (deux fois, y compris après #3361) : sur
 * `/chat`, le PREMIER clic ne changeait pas l'URL, le second menait à `/login`.
 * La sortie passait par `router.navigate` lancé depuis `onSettled` : or
 * `sessionManager.logout()` vide l'utilisateur AVANT, la page de l'écran se
 * re-rend en `RedirectTo`, le bandeau (et son observateur de mutation) se
 * démonte, et la navigation SPA se bat avec les autres `navigate` en vol
 * (garde, effets de l'écran) — la dernière écrite l'emporte, pas la nôtre.
 *
 * Ici : on attend la fin de la déconnexion (un échec réseau ne bloque pas — le
 * marqueur démo est déjà retiré côté client), on vide le cache, puis
 * NAVIGATION DURE vers `/login`. Elle ne peut être annulée par rien de ce qui
 * vit dans la page qu'on quitte, et repart d'une mémoire propre.
 *
 * #3788.6 — `qc.clear()` seul ne vide QUE react-query. Le scroll infini des
 * comptes et des contacts persiste sa page courante en localStorage
 * (`useAccountsStore`/`useContactsStore`, GA-43 — voir `useWorkspaces.ts` pour
 * la MÊME garantie à la frontière d'un changement d'espace) : sans ce
 * vidage, la salle démo laisse ses dossiers fictifs dans ce cache partagé par
 * TOUT l'origine, et le compte réel qui se reconnecte ensuite dans ce même
 * navigateur les verrait au premier rendu. `clearVolatileUserState` est le
 * mécanisme unique déjà utilisé par la déconnexion et le changement d'espace
 * (GA-26 : un réglage vit à un seul endroit).
 */
export function useExitDemo(): { exit: () => Promise<void>; isPending: boolean } {
  const [isPending, setIsPending] = useState(false)

  const exit = useCallback(async () => {
    setIsPending(true)
    // #4608 — l'identité d'avant la démonstration, si l'onglet en avait une.
    const previous = takePreDemoIdentity()
    try {
      // #4608 — on ne ferme que la salle : la session réelle ouverte à côté survit.
      await sessionManager.logout({ scope: 'tab' })
    } catch {
      // Le serveur peut refuser : l'état local est nettoyé quoi qu'il arrive.
    }
    clearVolatileUserState()
    endVoluntaryExit()
    if (previous) {
      // #4608 — on rend l'onglet à qui il était, sur l'écran d'où il venait.
      // Jamais `/login` quand on était connecté.
      rememberTabIdentity(previous.userId)
      window.location.assign(previous.path)
      return
    }
    window.location.assign('/login')
  }, [])

  return { exit, isPending }
}
