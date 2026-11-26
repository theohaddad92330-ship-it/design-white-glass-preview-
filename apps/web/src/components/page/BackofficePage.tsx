import { RedirectTo } from '@/components/navigation/RedirectTo'
import { memo, type ReactNode } from 'react'
import { useSession } from '@/lib/hooks/use-session'
import { CapabilityBanner } from '@/components/access/CapabilityBanner'
import type { WorkspacePermission } from '@bellum/contracts'
import { hasPermissions, useUserPermissions } from '@/lib/permissions'
import { GlobalLoadingState } from '../GlobalLoadingState'

interface BackofficePageProps {
  children: ReactNode
  /**
   * Les permissions d'ESPACE exigées par cette page d'opérateur.
   *
   * ⚠️ Distincte de l'accès au back-office lui-même, qui est un rôle de
   * PLATEFORME (`hasBackofficeRole(user?.roles)`, posé dans `app_metadata`) —
   * il n'existe aucune permission d'espace qui l'accorde. Cette prop sert aux
   * pages d'opérateur qui touchent en plus à un objet d'espace.
   */
  requiredPermissions?: WorkspacePermission[]
}

/**
 * Wrapper for internal/backoffice pages. Guards on session and permissions.
 * Unlike `CustomerPage`, there's no onboarding check — backoffice users are
 * expected to be provisioned with the required permissions directly.
 *
 * Session hydration is already handled upstream by `<SessionProvider>`. No
 * chrome is applied here — backoffice layouts are composed by the page itself.
 *
 * #2222 — les trois cas du rôle valent ICI AUSSI. Cette page lisait
 * `useUserPermissions()`, qui rendait `[]` pour tout le monde : le refus ne
 * pouvait pas se produire, et le jour où il se serait produit il aurait renvoyé
 * à l'accueil sans un mot. L'attente vient d'abord (le rôle n'est pas encore
 * là), le refus se DIT ensuite.
 */
export const BackofficePage = memo<BackofficePageProps>(function BackofficePage({ children, requiredPermissions }) {
  const { user } = useSession()
  const access = useUserPermissions()

  if (!user) return <RedirectTo to="/login" />
  // Aucune exigence : rien à attendre, rien à refuser. C'est la branche qui
  // évite de faire patienter chaque page d'opérateur sur une question que
  // personne ne pose.
  if (!requiredPermissions) return <>{children}</>
  // INCONNU n'est pas « aucun droit » : on attend, on ne refuse pas.
  if (access.status === 'unknown') return <GlobalLoadingState />

  // En erreur, fail-closed — on ne devine pas un rôle.
  const granted = access.status === 'known' && hasPermissions(requiredPermissions, access.permissions)
  if (!granted) {
    return <CapabilityBanner access={{ state: 'permission', missing: [...requiredPermissions] }} />
  }

  return <>{children}</>
})
