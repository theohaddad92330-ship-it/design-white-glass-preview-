import { SetMetadata } from '@nestjs/common'

/**
 * CETTE ROUTE EST UNE LECTURE D'ESPACE — IL N'Y A RIEN DE PLUS À AUTORISER.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MARQUEUR EXISTE (D39 · 28/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Le troisième cas, après `@PersonalScope` (22/08) et `@MarketData` (23/08).
 * Chacun des trois répond à la même question de GA-05 — « qu'est-ce qui garde
 * cette route ? » — pour un type de donnée différent :
 *
 * - `@PersonalScope` : la donnée de CELUI QUI APPELLE (ses réglages, sa boîte).
 * - `@MarketData`    : la donnée de PERSONNE (registre public, marchés publics).
 * - `@WorkspaceRead` : la donnée de L'ESPACE, en lecture seule.
 *
 * La mesure qui fonde celui-ci : `ROLE_PERMISSIONS` ne porte **aucune permission
 * de lecture**. C'est écrit noir sur blanc dans la matrice — « une entrée par
 * famille d'actions MUTANTES » — et le rôle `viewer` en est la preuve vivante :
 * il ne détient AUCUNE permission, et il lit pourtant tout l'espace. C'est
 * délibéré : voir un compte de son équipe est le principe même du portefeuille
 * partagé (D5).
 *
 * Une route de lecture n'a donc littéralement rien à déclarer dans cette
 * matrice. Faute de vocabulaire, deux chantiers de suite ont mal fini :
 *
 * 1. Le studio de proposition a posé `@RequirePermission('data:export')` — la
 *    seule des dix valeurs qui décrive à peu près ce qui s'y passe. Effet réel :
 *    la porte s'est fermée pour `viewer` (aucune permission) et `tech_admin`
 *    (`integrations:manage` seule), sur DEUX ROUTES QUI NE FONT QUE LIRE. Personne
 *    n'avait décidé ça ; c'est le vocabulaire qui manquait.
 * 2. `GET /accounts/hygiene` a fait rougir le cliquet GA-05 une seconde fois pour
 *    la même raison — et la réponse d'alors fut de fermer un vrai trou d'écriture
 *    ailleurs pour ramener le compte à son gel. Juste sur le fond, mais le
 *    problème posé restait entier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL AUTORISE : RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ **Ce marqueur n'ouvre aucune porte, et c'est le point le plus important.**
 * Il pose une métadonnée que **personne ne lit à l'exécution** : ni
 * `WorkspacePermissionGuard`, ni `JwtGuard`, ni aucun intercepteur. Retirer le
 * décorateur ne changerait strictement rien au comportement de l'API — seule la
 * garde d'architecture GA-05 s'en apercevrait.
 *
 * Ce qui protège une route marquée reste donc, exactement comme avant :
 *
 * - **`JwtGuard`** — l'identité. Sans jeton valide, rien ne passe.
 * - **La résolution d'espace SERVER-SIDE** —
 *   `WorkspaceContextService.resolveActiveWorkspace(userId)` rend un
 *   `workspaceId` déduit de l'appartenance de l'appelant. Il n'est **jamais**
 *   pris dans l'URL, le corps ou un en-tête : un utilisateur ne peut pas
 *   désigner l'espace qu'il veut lire. Sans aucune appartenance, cette
 *   résolution lève un 403.
 * - **La portée des données** — chaque requête filtre sur ce `workspaceId`, et
 *   la visibilité de portefeuille (D5) s'applique là où elle s'appliquait déjà.
 *
 * Ce que le marqueur change : `viewer` et `tech_admin` retrouvent une LECTURE
 * qu'une permission d'écriture leur avait retirée par accident. Il ne donne
 * accès à aucun espace dont on n'est pas membre, et il ne touche aucune
 * écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUAND NE PAS LE POSER
 * ─────────────────────────────────────────────────────────────────────────
 * La question à se poser, dans cet ordre :
 *
 * 1. *Cette route ÉCRIT-elle quoi que ce soit, ou dépense-t-elle un crédit ?*
 *    Si oui — même sous un verbe `@Get` — ce n'est pas une lecture, et la
 *    permission manque vraiment. (`POST /accounts/needs/play` est une lecture
 *    en apparence et un débit en fait : elle exige `contacts:enrich`.)
 * 2. *Existe-t-il une permission qui décrive VRAIMENT ce qu'elle expose ?*
 *    `finance:read` et `finance:read:own` gardent des lectures, elles : la
 *    marge et le coût chargé ne sont pas « la donnée de l'espace », ce sont des
 *    chiffres de paie. Une lecture financière ne porte pas ce marqueur.
 * 3. *Sort-elle de l'espace ?* Un partage public, un export nominatif vers un
 *    tiers, un lien qui survit à la révocation d'un siège : ce n'est plus une
 *    lecture d'espace, c'est une diffusion. `data:export` reste la bonne réponse.
 *
 * Et le garde-fou inverse : `@WorkspaceRead` n'est **pas** une porte alternative
 * au sens de `ALTERNATIVE_GUARDS` (`endpoint-guards.spec.ts`). Il qualifie une
 * ROUTE, jamais un contrôleur entier — `accounts.controller.ts` mélange six
 * lectures marquées et douze écritures gardées, et le compte des routes nues
 * doit continuer à le lire route par route.
 */
export const WORKSPACE_READ_KEY = 'bellum:workspace-read'

export const WorkspaceRead = () => SetMetadata(WORKSPACE_READ_KEY, true)
