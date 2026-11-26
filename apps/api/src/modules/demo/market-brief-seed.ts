import { marketBriefSchema, type MarketBrief } from '@bellum/contracts'
import lilleBrief from './data/market-briefs/lille.json'
import lyonAxeGeneveBrief from './data/market-briefs/lyon-axe-geneve.json'
import nantesSaintNazaireBrief from './data/market-briefs/nantes-saint-nazaire.json'
import suisseRomandeBrief from './data/market-briefs/suisse-romande.json'

/**
 * Les ZONES de la salle de démonstration — capacité « Marchés locaux » (lot L5, 05/10/2026) : ce qui fait passer trois
 * classeurs écrits à la main par le CEO (`data/market-briefs/*.json`, générés par `convert:market-brief`, jamais édités)
 * dans la table `market_zones` : Lille (59), Nantes–Saint-Nazaire (44), Lyon et axe Genève (69, 01, 38, 73, 74), Suisse
 * romande (GE, VD).
 *
 * ⚠️ RIEN n'est recopié à la main : le brief voyage tel quel dans `market_zones.brief`, VALIDÉ par le contrat au
 * chargement (un JSON qui sortirait du contrat fait échouer l'import du module, donc la CI, jamais la salle). 0 appel
 * LLM, `brief_origin = 'seed'`, aucun coût d'IA. Les comptes de la zone ne sont PAS semés : ils se calculent à la LECTURE
 * (`zone-accounts.ts`), depuis les comptes réels de l'espace.
 */

type DemoMarketZone = { slug: string; brief: MarketBrief }

const zone = (slug: string, json: unknown): DemoMarketZone => ({ slug, brief: marketBriefSchema.parse(json) })

export const DEMO_MARKET_ZONES: readonly DemoMarketZone[] = [
  zone('lille', lilleBrief),
  zone('nantes-saint-nazaire', nantesSaintNazaireBrief),
  zone('lyon-axe-geneve', lyonAxeGeneveBrief),
  zone('suisse-romande', suisseRomandeBrief),
]

/**
 * Les paramètres de l'INSERT d'une zone, dans l'ordre de `seedMarketZones` : espace, slug, libellé, périmètre,
 * départements, cantons, villes, brief (JSON), date du brief, auteur.
 */
export function marketZoneInsertParams(entry: DemoMarketZone, workspaceId: string, ownerUserId: string): unknown[] {
  const { zone: geo } = entry.brief
  return [
    workspaceId,
    entry.slug,
    geo.label,
    geo.scope,
    geo.departments,
    geo.cantons,
    geo.cities,
    JSON.stringify(entry.brief),
    entry.brief.generated_at,
    ownerUserId,
  ]
}
