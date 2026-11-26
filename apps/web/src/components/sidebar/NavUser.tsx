import { memo } from 'react'
import { UpgradeCard } from '@/features/billing/components/UpgradeCard'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { HIDDEN_WHEN_COLLAPSED } from './collapsed'
import { SidebarFooterActions } from './SidebarFooterActions'
import { UserDropdownMenu } from './UserDropdownMenu'

function displayName(firstName: string | null, lastName: string | null, fallback: string): string {
  const composed = [firstName, lastName].filter(Boolean).join(' ').trim()
  return composed || fallback
}

/**
 * Coque Théo — l'avatar du compte de la barre du haut (`ShellTopbar`) : initiales de la personne
 * CONNECTÉE, et le menu du compte (profil, raccourcis, déconnexion) pour déclencheur.
 * #4520 — la rangée « nom · rôle · espace » du pied de barre latérale a disparu.
 */
export const NavIdentity = memo(function NavIdentity() {
  const { data: profile } = useProfile()
  const fullName = displayName(profile?.first_name ?? null, profile?.last_name ?? null, 'Utilisateur')
  return (
    <UserDropdownMenu user={{ name: fullName, avatarUrl: profile?.avatar_url ?? null }} side="bottom" align="end" />
  )
})

export const NavUser = memo(function NavUser() {
  return (
    <>
      {/* La carte d'offre est un ARGUMENT, pas une commande : elle ne survit
          pas à un rail de 56 px, et la tronquer la rendrait illisible sans la
          rendre plus courte. */}
      <div className={HIDDEN_WHEN_COLLAPSED}>
        <UpgradeCard />
      </div>

      {/* Ni dans la maquette, ni retirées (décision Louis : on garde au plus près) — thème, langue,
          notifications et nouveautés restent au pied, au-dessus de l'identité. */}
      <SidebarFooterActions withCollapseToggle />
    </>
  )
})
