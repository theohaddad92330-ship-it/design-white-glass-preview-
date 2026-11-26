import { can, workspacePermissionValues, type WorkspacePermission, type WorkspaceRole } from '@bellum/contracts'
import { useSettledTeam } from '@/features/team/hooks/useSettledTeam'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Le droit de la personne qui regarde, côté écran (#2222).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER DISAIT AVANT, ET QUI N'ÉTAIT PLUS VRAI
 * ─────────────────────────────────────────────────────────────────────────────
 * « The backend doesn't expose an RBAC model yet » — c'était exact le jour où
 * la phrase a été écrite, et faux depuis des mois. Le serveur porte 341
 * endpoints décorés `@RequirePermission`, une matrice rôle → permissions
 * (`ROLE_PERMISSIONS`), neuf rôles, et `GET /workspaces/me` rend le rôle du
 * DEMANDEUR. Pendant ce temps `useUserPermissions()` rendait `[]`, ce qui
 * revenait à dire « cette personne n'a aucun droit » à propos de tout le monde,
 * y compris du propriétaire de l'espace.
 *
 * La conséquence n'était pas un refus abusif — `requiredPermissions` n'était
 * passée par aucun écran, donc le garde ne s'exécutait jamais — mais le
 * contraire : le seul refus qu'un utilisateur rencontrait était un **403 brut
 * de l'API, après le clic**. Un commercial ouvrait un écran, attendait, et
 * tombait sur une liste vide sans un mot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CAS, ET LE PREMIER EST CELUI QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le rôle arrive par le réseau. Entre le montage de l'écran et la réponse de
 * `GET /workspaces/me`, il est **INCONNU** — et « inconnu » n'est pas « aucune
 * permission ». Rendre `[]` pendant le chargement ferait clignoter un refus
 * d'accès sur des écrans que la personne paie, à chaque rechargement de page.
 * C'est la doctrine du dépôt (« non mesuré n'est jamais 0 ») appliquée à un
 * droit, et c'est la règle que `route-access.ts` pose déjà pour les paliers :
 * « le doute n'interdit pas ».
 *
 *  - `unknown` — la réponse n'est pas là. L'écran AFFICHE UNE ATTENTE, jamais
 *    un refus.
 *  - `known`   — le rôle est lu. La matrice tranche.
 *  - `error`   — la lecture a échoué. Là, et là seulement, c'est fail-closed :
 *    on ne DEVINE pas un rôle. Le serveur reste l'autorité de toute façon ; se
 *    donner « owner » par défaut sur une erreur réseau afficherait des écrans
 *    qui rendraient ensuite 403 sur chaque appel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE HOOK NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne décide RIEN côté sécurité : le cloisonnement est côté serveur, qui rend
 * un 403 (`WorkspacePermissionGuard`). Ce hook sert à le DIRE avant le clic,
 * pas à le tenir.
 */

/**
 * ⚠️ Il n'y a plus d'alias `Permission = string` ici, et c'est le coeur du
 * correctif : ce fichier déclarait son propre type de permission, ouvert à
 * n'importe quelle chaîne, à côté de l'enum fermé des contrats. Une permission
 * mal orthographiée s'écrivait donc sans que rien ne la voie. Les appelants
 * nomment désormais `WorkspacePermission` directement — un concept, un nom.
 */
type WorkspaceAccess =
  /** La réponse n'est pas encore là. Ce n'est PAS « aucun droit ». */
  | { status: 'unknown' }
  /** La lecture a échoué — fail-closed, on ne devine pas un rôle. */
  | { status: 'error' }
  | {
      status: 'known'
      role: WorkspaceRole
      /** Les accords EN PROPRE de cette personne, en plus de son rôle. */
      extraPermissions: readonly WorkspacePermission[]
      /** Le droit EFFECTIF : le rôle plus les accords en propre. */
      permissions: readonly WorkspacePermission[]
    }

/**
 * Le droit effectif de la personne dans l'espace actif.
 *
 * La requête partage `TEAM_KEY` avec {@link useTeam} et la barre latérale :
 * TanStack Query dédoublonne par clé, donc monter ce hook sur chaque enveloppe
 * de page n'ajoute **aucun** appel réseau.
 *
 * ⚠️ Les permissions ne sont pas recopiées ici — elles sont DÉRIVÉES de `can()`,
 * qui lit `ROLE_PERMISSIONS`. Le docblock de la matrice l'exige (« never
 * re-derive permissions from the role string elsewhere ») : une seconde table
 * côté web divergerait de la première au premier rôle ajouté.
 */
export function useUserPermissions(): WorkspaceAccess {
  const { user } = useSession()
  // #4630 — la lecture FILTRÉE : une réponse restaurée du cache persisté (espace précédent) = inconnu.
  const { team: data, isError } = useSettledTeam()

  if (isError) return { status: 'error' }
  if (!data) return { status: 'unknown' }

  // Une réponse SANS rôle est un rôle INCONNU, pas une page morte.
  //
  // `data.workspace.role` lu nu jette dès que la réponse n'a pas la forme
  // attendue — et ce hook est monté par l'enveloppe de TOUTE page cliente :
  // la frontière d'erreur du routeur remplace alors l'écran entier par
  // « Something went wrong! ». Un champ absent doit dégrader comme une requête
  // qui n'a pas encore répondu (« inconnu n'est pas aucun droit »), jamais
  // faire tomber l'écran.
  const role = data.workspace?.role
  if (!role) return { status: 'unknown' }
  // `extraPermissions` EXISTE : `GET /workspaces/me` le rend pour chaque membre
  // (`workspace-team.service.ts`, `hydrateMembers`), et la route n'est gardée
  // que par le JWT — tout membre reçoit donc sa propre ligne. `?? []` parce
  // qu'une réponse antérieure au champ reste valide (le champ est optionnel au
  // schéma) ; vide veut dire « aucune exception », jamais « on ne sait pas ».
  const extraPermissions = data.members?.find(member => member.userId === user?.id)?.extraPermissions ?? []

  return {
    status: 'known',
    role,
    extraPermissions,
    permissions: workspacePermissionValues.filter(permission => can(role, extraPermissions, permission)),
  }
}

/** Pure : toutes les permissions requises sont-elles détenues ? */
export function hasPermissions(
  required: readonly WorkspacePermission[],
  owned: readonly WorkspacePermission[],
): boolean {
  return required.every(permission => owned.includes(permission))
}
