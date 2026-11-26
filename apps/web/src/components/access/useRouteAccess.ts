import {
  resolveRouteAccess,
  routeContractFor,
  toolFamiliesOf,
  type RouteAccess,
  type RouteContract,
} from '@bellum/contracts'
import { useRouterState } from '@tanstack/react-router'
import { useToolRegistry } from '@/features/integration-center/api'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useUserPermissions } from '@/lib/permissions'

/**
 * L'état d'accès d'un écran, résolu côté client (PDF 1, BEL-ARCH-002).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE HOOK CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `CapabilityBanner` et `resolveRouteAccess` ont été livrés par le chantier du
 * PDF 1, testés, et n'ont longtemps eu **aucun appelant**. Ce hook les a
 * branchés — mais à moitié : il posait `role: 'owner'` EN DUR, avec un
 * commentaire qui l'assumait (« le rôle n'est pas lu ici »). Or `owner` porte
 * toutes les permissions de la matrice, délibérément (« un `owner` ne doit
 * jamais se voir refuser une route »). La branche `permission` de
 * `resolveRouteAccess` ne pouvait donc **jamais** se déclencher : du code juste,
 * testé, appelé — et pourtant mort sur sa dimension la plus importante.
 *
 * **Un garde qui dit toujours OUI est plus dangereux qu'un garde absent : on le
 * croit.** Un `viewer` voyait les écrans et les boutons, cliquait, et recevait
 * un 403 brut — exactement ce que le contrat de route disait vouloir éviter.
 *
 * ⚠️ LA RAISON INVOQUÉE POUR NE PAS LIRE LE RÔLE ÉTAIT FAUSSE (mesuré le
 * 16/09/2026). Elle disait : « les demander ferait une requête de plus à chaque
 * montage ». Il n'y a aucune requête de plus. `GET /workspaces/me` est **déjà
 * lu par chaque membre sur chaque écran** — la barre latérale en dépend
 * (`CustomerNavbarBody` lit `team.workspace.role` depuis des mois), et c'est
 * même la raison écrite pour laquelle le lexique d'espace voyage dans cette
 * réponse plutôt que dans une route à lui. La lecture passe par la même clé
 * TanStack Query (`TEAM_KEY`, `staleTime: 30_000`), donc elle est dédoublonnée.
 * Le coût invoqué n'existait pas ; le droit qu'il faisait renoncer, si.
 *
 * ⚠️ Le second défaut était plus discret. `planFeatures` valait
 * `contract.requiredPlanFeature && planFeature.allowed ? [feature] : []`, or
 * `resolveRouteAccess` lit une liste VIDE comme « on ne sait pas encore » et
 * n'enferme pas. Un palier REFUSÉ produisait donc exactement la même liste
 * vide qu'un palier en cours de chargement, et `plan_locked` ne se déclenchait
 * jamais non plus. On passe désormais la liste RÉELLE des paliers ouverts : la
 * distinction « vide = inconnu » retrouve son sens.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne décide RIEN côté sécurité. L'autorité reste le serveur, qui rend un 403 ;
 * ce hook sert à DIRE pourquoi un écran ne sert pas tout à fait, au lieu de
 * laisser l'utilisateur devant une liste vide.
 *
 * Le repli est OUVERT : tant que le registre d'outils charge, on considère les
 * capacités présentes. Un bandeau « ton agenda n'est pas connecté » affiché
 * pendant une seconde à chaque ouverture d'écran ferait douter d'une connexion
 * qui marche.
 */
export function useRouteAccess(contract: RouteContract): RouteAccess {
  const { data: tools, isLoading } = useToolRegistry()
  const { data: credits } = useCredits()
  const access = useUserPermissions()

  // Les capacités RÉELLEMENT opérationnelles — pas « une connexion existe » :
  // un jeton expiré est une connexion qui existe et qui ne répond pas.
  // ⚠️ `Array.isArray`, pas `?? []` : `??` ne rattrape QUE `null`/`undefined`.
  // Une réponse mal formée — un objet là où le contrat promet une liste — passe
  // au travers, `.filter` jette, et comme ce hook est monté par l'enveloppe de
  // TOUTE page cliente, la frontière d'erreur du routeur remplace l'écran
  // entier par « Something went wrong! ». Une capacité qu'on ne sait pas lire
  // est une capacité INCONNUE, pas une page morte.
  const capabilities = (Array.isArray(tools) ? tools : [])
    .filter(tool => tool.capability_state === 'operational')
    // #3973 — un outil compte dans chacune de ses familles (Microsoft 365 : agenda aussi).
    .flatMap(toolFamiliesOf)

  // Le doute n'interdit pas — la règle du contrat, appliquée au RÔLE.
  //
  // Tant que `GET /workspaces/me` n'a pas répondu, le rôle est INCONNU, et
  // « inconnu » n'est pas « aucun droit ». On retire alors la dimension
  // permission du contrat : l'écran ne doit pas clignoter un refus à chaque
  // rechargement de page. L'enveloppe de page, elle, AFFICHE UNE ATTENTE — voir
  // `useCurrentRouteAccess`.
  //
  // En ERREUR, c'est l'inverse et c'est délibéré : `viewer` ne porte aucune
  // permission, donc le refus se dit. On ne devine pas un rôle sur un réseau
  // qui a échoué.
  const effectiveContract = access.status === 'unknown' ? withoutPermission(contract) : contract
  const role = access.status === 'known' ? access.role : 'viewer'
  const extraPermissions = access.status === 'known' ? access.extraPermissions : []

  return resolveRouteAccess(effectiveContract, {
    role,
    extraPermissions,
    // La liste RÉELLE des paliers ouverts par l'offre. Vide = on ne sait pas
    // encore, et le contrat n'enferme pas dans ce cas (voir ci-dessus).
    planFeatures: credits?.features ?? [],
    capabilities: isLoading ? contract.degradesWithout : capabilities,
  })
}

/** Le même contrat, sans sa dimension permission. */
function withoutPermission(contract: RouteContract): RouteContract {
  const { requiredPermission: _ignored, ...rest } = contract
  return rest
}

/**
 * L'accès de l'écran COURANT, contrat lu au catalogue (#2222).
 *
 * C'est la forme que consomment les enveloppes de page : elles n'ont pas de
 * contrat sous la main, elles ont un chemin. `routeContractFor` replie
 * l'identifiant (`/accounts/3f1c…` → `/accounts/$id`), sans quoi le
 * cloisonnement ne s'appliquerait qu'aux écrans sans paramètre.
 *
 * ⚠️ Ce n'est PAS une seconde résolution d'accès (GA-26) : la décision reste
 * entièrement dans `resolveRouteAccess`, et ce hook délègue à
 * {@link useRouteAccess}. Il ne fait qu'une chose de plus — trouver le contrat
 * qui correspond au chemin courant.
 *
 * ⚠️ Et il ne redouble pas le bandeau d'un écran qui porte déjà le sien.
 * `TimesheetsPage` et `SequencesPage` passent un contrat EN LIGNE avec leur
 * `degradesWithout` et rendent leur propre `<CapabilityBanner>` ; le catalogue
 * ne redéclare donc pas leurs capacités. La règle du tome 7 tient — « un seul
 * bandeau de capacité par écran » : la PORTE est au niveau de la page, la
 * DÉGRADATION reste où l'écran la connaît.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `pending` — CE QUI JUSTIFIE UNE ATTENTE, ET CE QUI N'EN JUSTIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne vaut `true` que si l'écran exige VRAIMENT une permission ET que le rôle
 * n'est pas encore là. C'est la nuance qui empêche ce hook de coûter une
 * attente à tout le produit : la grande majorité des écrans n'exige aucune
 * permission, et les faire tous patienter sur `GET /workspaces/me` ajouterait
 * un aller-retour réseau visible à chaque navigation, pour une question qui
 * n'est pas posée.
 *
 * Une route ABSENTE du catalogue est OUVERTE, jamais fermée : un trou de
 * catalogage ne doit pas priver quelqu'un d'un écran qu'il paie. Le serveur
 * refuse de toute façon ce qu'il doit refuser.
 */
export function useCurrentRouteAccess(): { pending: boolean; access: RouteAccess } {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const permissions = useUserPermissions()
  const contract = routeContractFor(pathname) ?? openContract(pathname)
  const access = useRouteAccess(contract)

  return {
    pending: Boolean(contract.requiredPermission) && permissions.status === 'unknown',
    access,
  }
}

/** Le contrat d'une route que le catalogue ne connaît pas : ouverte. */
function openContract(pathname: string): RouteContract {
  return { path: pathname, section: 'inconnu', degradesWithout: [] }
}
