import { CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'
import type { FavoriteEntityType } from '@bellum/contracts'

/**
 * Un favori PERSONNEL (D10 du 28/08/2026).
 *
 * ⚠️ Aucune colonne `workspace_id`, et ce n'est pas un oubli : un favori est une
 * préférence de personne, pas un objet d'équipe. Le cloisonnement tient à la
 * clé primaire, qui commence par `user_id`, et à ce que chaque requête du
 * service porte ce `user_id`. La différence à garder en tête : la VEILLE
 * (`watchlist_rules`) est explicitement portée par le workspace — deux
 * commerciaux d'une même ESN qui suivent « ServiceNow » partagent une règle.
 * Deux commerciaux qui mettent le même compte en favori ont deux lignes, et
 * aucun ne voit celle de l'autre.
 *
 * `entity_id` est POLYMORPHE : il n'a donc aucune clé étrangère (une colonne ne
 * peut pas référencer deux tables). Les orphelins sont inertes — la lecture
 * hydrate par jointure et ne rend que ce qui existe encore dans l'espace actif.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1800 (09/09/2026) — LA NOTION DE FAVORI EST RETIRÉE. LA TABLE RESTE.
 * ─────────────────────────────────────────────────────────────────────────
 * Louis, en arbitre du produit : « tu peux supprimer la notion de favori et
 * cette page ça ne sert à rien. » Ce lot retire ce qui ATTEINT la table — la
 * page `/favorites`, l'onglet de nav, `FavoritesController`/`FavoritesService`,
 * l'onglet « Favoris » de `/contacts`, les routes `/contacts/:id/favorite`, et
 * chaque bouton ⭐ atteignable depuis un fichier qui n'était pas hors périmètre.
 *
 * Ce qu'il NE retire PAS : la table `user_favorites` ni ses colonnes. « On
 * archive, on ne supprime pas » (doctrine du dépôt) porte sur les MIGRATIONS,
 * pas sur les gestes qui les atteignent — une migration appliquée en
 * production ne se défait pas, et rien n'oblige à défaire la table pour retirer
 * l'écran qui la lisait. Cette entité reste donc DÉCLARÉE (et enregistrée dans
 * `database.module.ts`) pour que TypeORM continue de connaître la table et que
 * les gardes d'architecture qui en dépendent — `table-scope-registry.spec.ts`
 * (GA-65, elle lit les métadonnées TypeORM des entités enregistrées) et
 * `check-constraints-cover-enums.spec.ts` (`user_favorites_entity_type_check`
 * ↔ `FAVORITE_ENTITY_TYPES`, toujours exporté par
 * `packages/contracts/src/schemas/favorites.ts`) — restent vraies. Sans
 * `UserFavoriteEntity`, ces deux gardes n'auraient plus rien à lire pour une
 * table qui existe toujours en base.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2150.14/.18 (15/09/2026) — REVIREMENT ASSUMÉ DE #1800. LE FAVORI REVIENT.
 * ─────────────────────────────────────────────────────────────────────────
 * Retour bêta #2150, Louis retranche : le favori de compte revient — une
 * étoile par compte, personnelle, jamais partagée à l'équipe. Ce qui écrit à
 * nouveau par ce chemin : `AccountsService.setAccountFavorite` (une étoile de
 * ligne), `AccountFavoritesController` (`POST`/`DELETE /accounts/:id/favorite`),
 * et `DemoSeedService.seedWorkspace` (un favori GOLDEN par salle de
 * démonstration, sinon le filtre « Mes favoris » de `/accounts` s'ouvre sur du
 * VIDE devant un prospect).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2150.14 (15/09/2026) — LE FAVORI DE COMPTE REVIENT, ET LUI SEUL.
 * ─────────────────────────────────────────────────────────────────────────
 * Revirement postérieur à #1800 : l'étoile revient sur une LIGNE du
 * portefeuille (`account-favorites.controller.ts`, `setAccountFavorite`,
 * `is_favorite` dans la liste de comptes). Ce qui avait été retiré et qui ne
 * revient PAS : la page `/favorites`, son onglet de nav, l'onglet « Favoris »
 * de `/contacts` et les routes `/contacts/:id/favorite`. Le paragraphe
 * ci-dessus reste vrai pour tout ce qui n'est pas un compte — il n'est plus
 * vrai de la table entière, et c'est pour ça qu'il est amendé ici plutôt que
 * laissé à contredire le code.
 *
 * L'entité vit à côté de son module, comme `WatchlistRuleEntity` : le module est
 * autonome (règle #7), le retirer n'enlève que les favoris.
 */
@Entity({ name: 'user_favorites' })
@Index('user_favorites_entity_idx', ['entity_type', 'entity_id'])
export class UserFavoriteEntity {
  @PrimaryColumn('uuid')
  user_id: string

  @PrimaryColumn('text')
  entity_type: FavoriteEntityType

  @PrimaryColumn('uuid')
  entity_id: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}

/**
 * Le nom de la table, à UN seul endroit.
 *
 * La liste de contacts la joint en QueryBuilder (`leftJoin('user_favorites', …)`)
 * plutôt que par repository : sans cette constante, le nom serait recopié à la
 * main dans un second module, et une renommée future n'en corrigerait qu'un.
 */
export const USER_FAVORITES_TABLE = 'user_favorites'
