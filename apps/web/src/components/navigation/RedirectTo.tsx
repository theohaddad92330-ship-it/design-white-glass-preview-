import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { sessionManager } from '@/features/auth/session-manager'
import { isTabDemo } from '@/features/auth/demo-tab'

/**
 * Une redirection qui part UNE fois — le remplaçant de `<Navigate>`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION LE 23/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * `<Navigate>` de TanStack Router compare l'**identité de l'objet props** pour
 * décider s'il doit renaviguer :
 *
 * ```js
 * if (previousPropsRef.current !== props) { navigate(props); … }
 * ```
 *
 * JSX crée un objet props NEUF à chaque rendu. Pendant que la transition React
 * est en cours, le composant qui rend `<Navigate>` continue de se rendre — et
 * chaque rendu relance une navigation. Mesuré sur la seule transition
 * `/` → `/dashboard` : **106 erreurs React #185** (« Maximum update depth
 * exceeded ») avant que la transition ne finisse par committer.
 *
 * L'écran arrivait quand même : c'est ce qui a rendu le défaut invisible
 * pendant des mois. Il coûtait cent rendus, une pile d'exceptions dans Sentry,
 * et une transition qui « accroche » sans qu'on sache dire pourquoi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI CHANGE ICI
 * ─────────────────────────────────────────────────────────────────────────
 * La comparaison porte sur la DESTINATION, une chaîne, qui ne change pas d'un
 * rendu à l'autre. Une seconde redirection vers un autre endroit reste
 * possible — c'est le cas d'un utilisateur dont la session tombe pendant qu'il
 * est redirigé — mais la même destination ne part jamais deux fois.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `/login` DÉTOURNÉ POUR UN ONGLET EN DÉMONSTRATION (constat 27/09/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Les trois gardes `!user` de l'app (`CustomerPageContent`, `SettingsPage`,
 * `BackofficePage`) rendent TOUTES `<RedirectTo to="/login" />` quand la
 * session tombe — 401 ordinaire, appareil révoqué, jeton expiré. Pour un
 * visiteur normal c'est la bonne destination ; pour un visiteur de la
 * DÉMONSTRATION, qui n'a ni compte ni mot de passe, `/login` est un mur : la
 * bannière « MODE DÉMO » disparaît et l'onglet reste sans issue.
 *
 * `isTabDemo()` (`demo-tab.ts`) survit précisément à ce `clear()` involontaire
 * — c'est ce qui permet de savoir, ICI, que cet onglet travaillait pour la
 * démonstration. On y renvoie alors (`/demo/acces`), avec un message plutôt
 * qu'un formulaire muet. Seule la destination `/login` est détournée : les
 * autres (`/onboarding`, etc.) ne changent jamais de sens selon l'onglet.
 */
function subscribeSession(listener: () => void): () => void {
  return sessionManager.subscribe(listener)
}

function isSessionDown(): boolean {
  const { user, sessionUnavailable } = sessionManager.getState()
  return !user && sessionUnavailable
}

export function RedirectTo({ to, replace = true }: { to: string; replace?: boolean }) {
  const navigate = useNavigate()
  const sent = useRef<string | null>(null)
  const isDemoLoginBounce = to === '/login' && isTabDemo()
  const target = isDemoLoginBounce ? '/demo/acces' : to
  // #3243 (régression 03/10) — « le serveur n'a pas répondu » n'est PAS « tu es
  // déconnecté » : tant que le démarrage de la session est en panne (et rejoué
  // par `SessionManager`), on ne part pas vers /login. Le bandeau le dit.
  const sessionDown = useSyncExternalStore(subscribeSession, isSessionDown, isSessionDown)
  const held = sessionDown && to === '/login'

  useEffect(() => {
    if (held || sent.current === target) return
    sent.current = target
    // `replace` par défaut : une redirection n'est pas une étape de navigation.
    // Sans lui, le bouton « retour » du navigateur renvoie sur l'écran qui
    // redirige, qui redirige à nouveau — l'utilisateur ne peut plus revenir.
    if (isDemoLoginBounce) {
      void navigate({ to: target, replace, search: { reason: 'expired' } })
    } else {
      void navigate({ to: target, replace })
    }
  }, [target, replace, navigate, isDemoLoginBounce, held])

  return null
}
