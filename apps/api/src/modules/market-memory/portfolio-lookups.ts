import type { MarketCompanyLookup } from './market-memory.service'

/**
 * #1581.1 — LA MISE EN FORME DES CLÉS DU PORTEFEUILLE, ÉCRITE UNE FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /accounts/market-memory-portfolio` (#1633 / #1635) et le contexte du
 * copilote (#1581.1) posent la MÊME question au même service. Le docbloc de la
 * route le dit déjà pour les trois écrans qui la consomment : « trois routes
 * auraient produit trois dérivations, donc trois nombres — c'est mot pour mot ce
 * que #1621 décrit (41 dans Account, 38 dans Partners, 44 dans Laura) ».
 *
 * Un appelant de plus, c'est un quatrième nombre possible. Ce qui se recopiait
 * le plus facilement est justement le détail qui change le résultat : le PAYS.
 * Sans lui, deux homonymes du corpus restent ambigus (#1617) et l'agrégat
 * annonce une file de revue qui n'a pas lieu d'être — la même lecture rendrait
 * alors deux chiffres différents selon l'appelant, sans que rien n'échoue.
 *
 * ⚠️ Ce fichier ne s'appelle pas `*.service.ts` à dessein : c'est une mise en
 * forme pure, pas une dépendance. Il n'injecte rien et ne lit rien.
 */

/**
 * Les clés de rapprochement du portefeuille, prêtes pour `portfolioFor`.
 *
 * ⚠️ `country` VOYAGE, contrairement à la liste de comptes : c'est le seul
 * départage que le corpus permet entre deux homonymes (#1617). Il n'est pas
 * deviné quand il manque — une ambiguïté reste une ambiguïté.
 */
export function marketPortfolioLookups(
  // La forme que `AccountsService.listPortfolioLookups` rend, écrite en ligne : un
  // type exporté que personne n'importe fait rougir knip, et celui-ci n'a qu'un
  // seul lecteur — cette signature.
  rows: readonly { id: string; company_name: string; website: string | null; registry_country: string | null }[],
): MarketCompanyLookup[] {
  return rows.map(row => ({
    ref: row.id,
    name: row.company_name,
    website: row.website,
    country: row.registry_country,
  }))
}
