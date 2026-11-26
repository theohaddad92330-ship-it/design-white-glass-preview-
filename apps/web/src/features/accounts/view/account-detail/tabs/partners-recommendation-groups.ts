import { DEFAULT_ENTITY_NAME } from '@bellum/contracts'

type RecommendationLine = {
  entity_id: string | null
  entity_name: string
  play: string
  partner: string | null
  reason: string
}

type RecommendationGroup<T extends RecommendationLine> = { play: string; reason: string; items: T[] }

/**
 * #3464 — la forme d'un nom pour décider « c'est le même périmètre » : sans
 * accents ni casse, sans le suffixe « — Groupe » que la source ajoute à la
 * maison mère. « Societe Generale », « Société Générale » et « Société
 * Générale — Groupe » sont UN périmètre ; deux entités distinctes (« Société
 * Générale Private Banking ») le restent.
 */
function perimeterKey(name: string): string {
  const flat = (value: string): string =>
    value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*$/u, '')
      .replace(/\s+/g, ' ')
      .trim()
  const [head = '', ...rest] = flat(name).split(/\s+[—–]\s+/u)
  // « Maison mère — Périmètre » et « Périmètre » sont UN périmètre ; « Maison
  // mère — Groupe » est la maison mère elle-même.
  const tail = rest
    .join(' — ')
    .replace(/^groupe\s*\/?\s*/u, '')
    .trim()
  return tail === '' ? head : tail
}

/**
 * Regroupe les périmètres par issue (`play`) et par raison — la raison est
 * statique par `play` (`rank1Recommendation`), donc l'issue se dit UNE fois par
 * groupe, en tête, au lieu d'un badge par ligne (mur de 17 pastilles,
 * recette prod 30/09). Les doublons de nom (même périmètre, même partenaire)
 * disparaissent ; ordre de première apparition, résidu
 * (`DEFAULT_ENTITY_NAME`) repoussé en fin de groupe.
 */
export function groupRecommendations<T extends RecommendationLine>(
  recommendations: readonly T[],
): RecommendationGroup<T>[] {
  const groups = new Map<string, RecommendationGroup<T>>()
  const seen = new Set<string>()
  for (const item of recommendations) {
    const groupKey = `${item.play}\u0000${item.reason}`
    const lineKey = `${groupKey}\u0000${perimeterKey(item.entity_name)}\u0000${item.partner ?? ''}`
    if (seen.has(lineKey)) continue
    seen.add(lineKey)
    const group: RecommendationGroup<T> = groups.get(groupKey) ?? { play: item.play, reason: item.reason, items: [] }
    group.items.push(item)
    groups.set(groupKey, group)
  }
  return [...groups.values()].map(group => ({
    ...group,
    items: [
      ...group.items.filter(item => item.entity_name !== DEFAULT_ENTITY_NAME),
      ...group.items.filter(item => item.entity_name === DEFAULT_ENTITY_NAME),
    ],
  }))
}
