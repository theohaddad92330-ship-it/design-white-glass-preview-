/**
 * Ce que la suppression d'un utilisateur EMPORTE, nommé (#1664.2).
 *
 * La décision vit ici, hors du composant, parce que l'environnement de test de
 * cette application est `node` : ce qui se garde est la LOGIQUE, ce qui se
 * voit à l'écran se recette en direct (cf. `vitest.config.mts`).
 *
 * `AdminUsersService.deleteUser` ne supprime QUE le compte d'authentification
 * Supabase — nos propres lignes (profil, abonnement, espaces, actions déjà
 * réalisées) cascadent ou deviennent orphelines selon leur configuration de
 * clé étrangère. Deux faits changent radicalement selon le RÔLE de la
 * personne dans chaque espace où elle apparaît :
 *
 *  · `workspaces.owner_user_id` porte `ON DELETE CASCADE` vers `auth.users`
 *    (migration `1784000000000-MultiUserWorkspaces.ts`) — supprimer le
 *    PROPRIÉTAIRE d'un espace supprime l'espace ENTIER avec lui : tous ses
 *    comptes, contacts, analyses, pas seulement les données de cette
 *    personne. C'est le fait le plus dommageable qu'une confirmation puisse
 *    omettre, et c'est exactement ce que l'ancien message ne disait pas.
 *  · Un simple membre (`role !== 'owner'`) ne perd que sa propre ligne
 *    `workspace_members` (CASCADE elle aussi) — l'espace continue d'exister
 *    pour les autres.
 */
export type DeleteUserWorkspaceRef = { id: string; name: string; role: string }

type DeleteUserConsequence = {
  /** Espaces dont cette personne est PROPRIÉTAIRE — supprimés ENTIÈREMENT
   *  avec elle (cascade DB), pas seulement ses propres données. */
  ownedWorkspaceNames: string[]
  /** Espaces où cette personne est simple MEMBRE — elle en perd l'accès,
   *  l'espace continue d'exister pour les autres. */
  memberWorkspaceNames: string[]
}

export function describeDeleteUserConsequence(workspaces: DeleteUserWorkspaceRef[]): DeleteUserConsequence {
  return {
    ownedWorkspaceNames: workspaces.filter(w => w.role === 'owner').map(w => w.name),
    memberWorkspaceNames: workspaces.filter(w => w.role !== 'owner').map(w => w.name),
  }
}
