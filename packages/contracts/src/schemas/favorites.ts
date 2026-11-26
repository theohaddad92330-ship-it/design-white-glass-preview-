import { z } from 'zod'

/**
 * LES FAVORIS PERSONNELS — D10 du 28/08/2026 (décision de Louis).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1800 (09/09/2026) PUIS #2150.14/.18 (15/09/2026) — LE REVIREMENT ASSUMÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Louis avait tranché le 09/09 : « tu peux supprimer la notion de favori et
 * cette page ça ne sert à rien. » `FavoritesController`/`FavoritesService`,
 * `/favorites`, l'onglet « Favoris » de `/contacts` et chaque bouton ⭐
 * atteignable avaient été retirés — voir `user-favorite.entity.ts` pour le
 * récit complet côté données.
 *
 * Retour bêta #2150, tranché de nouveau par Louis le 15/09/2026 : le favori
 * de COMPTE revient, scopé au portefeuille `/accounts` — une étoile par
 * compte, propre à chaque personne, jamais partagée à l'équipe, avec un
 * filtre « Mes favoris » à côté des vues enregistrées
 * (`accountListQuerySchema.favorite`, `AccountFavoritesController`). Le
 * favori de CONTACT et de TALENT reste retiré : seule l'écriture côté compte
 * a un appelant de nouveau, `contacts`/`talents` n'en ont toujours aucun.
 *
 * Rien n'a dû être recréé côté données : la table `user_favorites`, sa
 * contrainte `user_favorites_entity_type_check` et sa policy RLS
 * (`auth.uid() = user_id`) n'avaient jamais bougé (« on archive, on ne
 * supprime pas ») — c'est CE fait qui rend le revirement bon marché.
 *
 * `FAVORITE_ENTITY_TYPES` / `favoriteEntityTypeSchema` / `FavoriteEntityType`
 * ont donc de nouveau un appelant d'ÉCRITURE (`AccountsService.setAccountFavorite`,
 * avec la valeur `'account'`) en plus de leurs deux lecteurs déjà en place :
 * `UserFavoriteEntity` (colonne `entity_type`) et
 * `check-constraints-cover-enums.spec.ts` (`user_favorites_entity_type_check`
 * ↔ `FAVORITE_ENTITY_TYPES`).
 *
 * ⚠️ L'ordre de {@link FAVORITE_ENTITY_TYPES} reste FIGÉ (GA-08) : c'est la
 * contrainte SQL `user_favorites_entity_type_check`, déjà appliquée en
 * production, qui le fige — une valeur future s'ajoute EN FIN, jamais au
 * milieu, dans une migration qui élargit la contrainte AVANT le code qui
 * l'écrit (GA-11/GA-12).
 */
export const FAVORITE_ENTITY_TYPES = ['contact', 'account', 'talent'] as const

export const favoriteEntityTypeSchema = z.enum(FAVORITE_ENTITY_TYPES)
export type FavoriteEntityType = z.infer<typeof favoriteEntityTypeSchema>
