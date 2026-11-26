import { z } from 'zod'
import { hasPermission, type WorkspaceRole } from './workspace.js'
import { portfolioVisibilitySchema, type PortfolioVisibility } from './portfolio-visibility.values.js'

/**
 * Qui voit quels comptes — le cloisonnement de portefeuille, réglable par espace.
 *
 * Le produit lit aujourd'hui tout le portefeuille de l'équipe pour chaque
 * membre, et c'est un choix assumé : « ne pas se marcher dessus » suppose de
 * voir ce que fait le voisin avant d'appeler le même compte. Ce défaut ne
 * change pas.
 *
 * Mais certaines ESN ne peuvent pas travailler comme ça — commissionnement
 * individuel, équipes concurrentes sur le même marché, sous-traitance. Leur
 * seule option était de créer un espace par commercial, c'est-à-dire de perdre
 * l'équipe, les quotas partagés et le cockpit du responsable pour régler une
 * question de visibilité.
 *
 * Deux réglages, et un seul point subtil : en mode cloisonné, un commercial
 * voit ce qu'il PORTE **et ce que personne ne porte**. Sans cette seconde
 * moitié, les comptes non attribués disparaîtraient de la vue de tout le monde
 * sauf des responsables — et un compte que personne ne voit est un compte que
 * personne ne travaille. La file des non-attribués est précisément ce qui fait
 * vivre un portefeuille.
 */
export {
  PORTFOLIO_VISIBILITIES,
  portfolioVisibilitySchema,
  type PortfolioVisibility,
} from './portfolio-visibility.values.js'

/** Corps de `PATCH /workspaces/portfolio-visibility`. */
export const setPortfolioVisibilitySchema = z.object({ visibility: portfolioVisibilitySchema })
export type SetPortfolioVisibility = z.infer<typeof setPortfolioVisibilitySchema>

/**
 * Ce que ce membre a le droit de voir.
 *
 * `null` = tout le portefeuille de l'espace. Sinon, l'identifiant dont les
 * comptes lui sont visibles — à quoi l'appelant ajoute les comptes libres.
 *
 * Fonction PURE, et c'est délibéré : le cloisonnement est le genre de règle
 * qu'on ne peut pas vérifier à l'œil dans une requête SQL de quarante lignes.
 * Ici elle se lit, se teste sans base, et ne peut pas diverger entre les
 * quatre écrans qui listent des comptes.
 *
 * Un porteur de `team:manage` voit toujours tout : un responsable qui ne voit
 * pas le portefeuille de son équipe ne peut ni l'attribuer, ni le rééquilibrer,
 * ni repérer ce qui dort — c'est-à-dire ne peut pas faire son travail.
 */
export function portfolioScopeFor(
  role: WorkspaceRole,
  visibility: PortfolioVisibility,
  userId: string,
): { ownerId: string; includeUnassigned: true } | null {
  if (visibility === 'open') return null
  if (hasPermission(role, 'team:manage')) return null
  return { ownerId: userId, includeUnassigned: true }
}

/**
 * #4996 L3 — LA clause SQL du cloisonnement, écrite UNE fois.
 *
 * « Ce que je porte, OU ce que personne ne porte, OU ce dont je suis co-équipier
 * actif » (`account_team_members`, `removed_at IS NULL`). La troisième moitié est
 * celle du compte groupe : un co-équipier ajouté à BNP voit BNP même en mode
 * cloisonné. Le paramètre lié s'appelle `:ownerId` (`scope.ownerId`). Les quatre
 * requêtes qui listent des comptes passent par ici — aucune ne la recopie.
 *
 * @param alias alias SQL de la table `accounts` dans la requête appelante.
 */
export function portfolioScopeClause(alias: string): string {
  return (
    `(${alias}.assigned_to = :ownerId OR ${alias}.assigned_to IS NULL OR EXISTS ` +
    `(SELECT 1 FROM account_team_members atm WHERE atm.account_id = ${alias}.id ` +
    `AND atm.user_id = :ownerId AND atm.removed_at IS NULL))`
  )
}

/**
 * Le jugement MÉMOIRE de {@link portfolioScopeClause} : même règle, un compte déjà
 * chargé. `isActiveTeammate` = ce lecteur est co-équipier actif de ce compte
 * (lu par l'appelant). `scope === null` (ouvert, ou `team:manage`) = tout est visible.
 */
export function isInPortfolio(
  scope: { ownerId: string } | null,
  account: { assigned_to: string | null },
  isActiveTeammate: boolean,
): boolean {
  if (!scope) return true
  if (account.assigned_to === null || account.assigned_to === scope.ownerId) return true
  return isActiveTeammate
}
