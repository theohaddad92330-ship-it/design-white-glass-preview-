import type { MarketRoleFamily } from '@bellum/contracts'
import {
  deaccentLower,
  isResidualRoleFamily,
  resolveBuyerRoleFamily,
  resolveBuyerRoleFamilyFromTitle,
} from '@bellum/contracts'

/**
 * K.3 / #4325 (Louis 19/10/2026, call refonte UX) — « Autre » n'est pas un métier.
 *
 * Dans l'historique observé, « Autre » est la plus grosse « famille » (« Autre 225 · Direction / Conseil 106 »)
 * et ne dit rien d'actionnable : c'est le reste que le corpus n'a rangé dans AUCUN métier. Il ne se présente
 * donc pas dans la liste des familles (PR #1755 : « Autre » n'est pas une famille de rôles) ; il garde son
 * nombre, à part, et son DÉTAIL — les intitulés qu'il regroupe.
 *
 * Le corpus ne porte pas les intitulés de son « Autre » : le détail vient des contacts de CE compte, dans
 * l'espace, que ni leur famille déclarée ni leur intitulé ne rangent dans un métier. Pur, sans I/O.
 */
/** Combien d'intitulés sont montrés avant « Voir plus ». */
export const OTHER_DETAIL_LIMIT = 6

/** Les familles métier d'un côté, le reste « Autre » (nombres cumulés) de l'autre. */
export function splitOtherRoleFamily(families: readonly MarketRoleFamily[]): {
  families: MarketRoleFamily[]
  other: { persons: number } | null
} {
  const kept = families.filter(entry => !isResidualRoleFamily(entry.family))
  const persons = families
    .filter(entry => isResidualRoleFamily(entry.family))
    .reduce((sum, entry) => sum + entry.persons, 0)
  return { families: kept, other: persons > 0 ? { persons } : null }
}

interface OtherTitleRow {
  title: string
  count: number
}

/**
 * Les intitulés des contacts qu'AUCUN métier ne range (ni la famille déclarée, ni l'intitulé), regroupés par
 * intitulé normalisé — du plus fréquent au moins fréquent, puis alphabétique. Un contact sans intitulé n'a
 * pas de ligne : on n'affiche pas ce qu'on n'a pas.
 */
export function otherRoleTitleDetail(
  contacts: ReadonlyArray<{ family?: string | null; title?: string | null }>,
): OtherTitleRow[] {
  const rows = new Map<string, OtherTitleRow>()
  for (const contact of contacts) {
    const title = (contact.title ?? '').trim().replace(/\s+/g, ' ')
    if (title === '') continue
    if (resolveBuyerRoleFamily(contact.family) ?? resolveBuyerRoleFamilyFromTitle(title)) continue
    const key = deaccentLower(title)
    const known = rows.get(key)
    if (known) known.count += 1
    else rows.set(key, { title, count: 1 })
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
}
