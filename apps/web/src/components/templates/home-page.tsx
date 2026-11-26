import { RedirectTo } from '@/components/navigation/RedirectTo'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useSession } from '@/lib/hooks/use-session'
import { resolveDefaultLandingRoute, useReadPreferences } from '@/features/preferences/preferences-provider'
import { hasBackofficeRole, hasCustomerRole } from '@/utils/role'
import { InviteToLoginPage } from './invite-to-login/invite-to-login-page'

export default function HomePage() {
  const session = useSession()
  const preferences = useReadPreferences()
  const isMobile = useIsMobile()
  if (!session?.user) return <InviteToLoginPage />
  // D34 (Louis, 28/08/2026) — un opérateur RESTE un utilisateur.
  //
  // Le rôle `backoffice` détournait l'accueil vers `/bak/home`, une page qui
  // disait « À implémenter. » et n'offrait aucune sortie. Il n'ouvre plus rien
  // de particulier ICI : il n'ajoute qu'une entrée à la barre latérale
  // (`CustomerNavbarBody`). Les deux rôles mènent donc au même accueil.
  //
  // ⚠️ Le rôle se pose à la main dans `app_metadata.roles` (Supabase) : rien ne
  // garantit que `customer` accompagne `backoffice`. Tester `customer` seul
  // renverrait un opérateur provisionné seul sur l'écran d'invitation à se
  // connecter — un cul-de-sac de plus, à la place de celui qu'on retire.
  const signedInUser = hasCustomerRole(session.user.roles) || hasBackofficeRole(session.user.roles)
  if (!signedInUser) return <InviteToLoginPage />
  // #1786 — LA dérivation, partagée avec la connexion (`resolveLandingFrom`) :
  // Laura sur mobile quelle que soit la préférence de démarrage (décision de
  // Louis du 23/08), sinon l'écran choisi dans Préférences › Démarrage — dont
  // le défaut est désormais Laura, pas le tableau de bord.
  return <RedirectTo to={resolveDefaultLandingRoute(isMobile, preferences.defaultView)} />
}
