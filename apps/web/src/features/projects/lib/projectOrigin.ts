/**
 * #3683.6 — « LE LIEN DE RETOUR RAMÈNE AU MÊME COMPTE, AU MÊME ONGLET ».
 *
 * Même grammaire d'URL que l'origine d'une fiche contact (`from` / `fromId` /
 * `fromTab`, `features/contacts/lib/contactOrigin.ts`) : l'origine voyage dans
 * l'adresse, donc elle survit à un rechargement. Une origine sans identifiant
 * ou d'un genre inconnu n'en est pas une — on ne devine jamais un retour.
 */
type ProjectOriginTab = 'overview' | 'veille' | 'plan'

export type ProjectOrigin = { accountId: string; tab: ProjectOriginTab }

type ProjectOriginSearch = { from: 'account'; fromId: string; fromTab: ProjectOriginTab }

const ORIGIN_TABS: readonly ProjectOriginTab[] = ['overview', 'veille', 'plan']

/** Les clés d'URL qui portent l'origine, à passer en `search` vers `/projects/$id`. */
export function projectOriginSearch(origin: ProjectOrigin): ProjectOriginSearch {
  return { from: 'account', fromId: origin.accountId, fromTab: origin.tab }
}

/** L'origine que l'URL porte, ou `null` quand elle est absente, incomplète ou inconnue. */
export function readProjectOrigin(search: Record<string, unknown>): ProjectOrigin | null {
  const fromId = typeof search.fromId === 'string' && search.fromId.length > 0 ? search.fromId : null
  if (fromId === null || search.from !== 'account') return null
  const tab = ORIGIN_TABS.find(candidate => candidate === search.fromTab) ?? 'veille'
  return { accountId: fromId, tab }
}
