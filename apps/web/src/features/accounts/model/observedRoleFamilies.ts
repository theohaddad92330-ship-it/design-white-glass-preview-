import type { AccountMarketContext } from '@bellum/contracts'
import { isResidualRoleFamily, MARKET_PREVIEW_MAX_ITEMS } from '@bellum/contracts'

/**
 * #2127.5 / #2127.8 — LES FAMILLES D'EXPERTISE OBSERVÉES, TELLES QUE DEUX ÉCRANS LES LISENT.
 *
 * La synthèse du dossier (`AccountMarketMemoryCard`) et le contexte sous un
 * signal d'emploi (`WatchSignalTimeline`) montrent la MÊME liste : deux
 * dérivations divergeraient au premier remaniement.
 *
 * · le seau résiduel (« Autre ») sort par `isResidualRoleFamily` — il arrivait
 *   premier partout (#1755) ;
 * · les plus citées d'abord, `MARKET_PREVIEW_MAX_ITEMS` au plus : un aperçu,
 *   jamais un recensement ;
 * · `undefined` quand le champ n'existe pas (API antérieure, ou mémoire non
 *   lue), `[]` quand il existe sans aucune famille nommée. L'appelant choisit
 *   ce qu'il écrit dans chaque cas — jamais « aucune ».
 */
export function observedRoleFamilyLabels(
  context: Pick<AccountMarketContext, 'role_families'> | null | undefined,
): string[] | undefined {
  return context?.role_families
    ?.filter(entry => !isResidualRoleFamily(entry.family))
    .sort((a, b) => b.persons - a.persons)
    .slice(0, MARKET_PREVIEW_MAX_ITEMS)
    .map(entry => entry.family)
}
