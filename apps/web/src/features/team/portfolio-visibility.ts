import { portfolioVisibilitySchema, type PortfolioVisibility } from '@bellum/contracts'

/**
 * Le cloisonnement de portefeuille en vigueur, lu sur l'espace que renvoie
 * `GET /workspaces/me`.
 *
 * Pourquoi une lecture DÉFENSIVE plutôt qu'un champ du type `WorkspaceTeam` :
 * l'endpoint d'écriture (`PATCH /workspaces/portfolio-visibility`) existe, le
 * calcul de portée (`portfolioScopeFor`) existe, mais **aucune route ne
 * RENVOIE la valeur en cours** — `getTeam` compose son objet `workspace` à la
 * main et n'y met que `communityDataSharing`. Tant que la moitié lecture n'est
 * pas là, cet écran n'a rien à lire.
 *
 * `null` est donc une réponse honnête, et la seule : le repli sur 'open' — le
 * défaut du serveur — afficherait « ouvert à toute l'équipe » comme le réglage
 * en cours à une ESN qui a cloisonné. Un réglage affiché faux est pire qu'un
 * réglage affiché inconnu.
 *
 * La valeur est validée par le schéma zod du CONTRAT et jamais comparée à des
 * chaînes recopiées : le jour où le serveur envoie le champ, il est accepté
 * sans une ligne de plus ici, et une valeur qui ne serait pas dans
 * `PORTFOLIO_VISIBILITIES` est refusée plutôt qu'affichée.
 */
export function readPortfolioVisibility(workspace: object): PortfolioVisibility | null {
  const raw = (workspace as { portfolioVisibility?: unknown }).portfolioVisibility
  const parsed = portfolioVisibilitySchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
