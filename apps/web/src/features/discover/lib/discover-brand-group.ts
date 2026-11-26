import type { DiscoverCandidate } from './discover-types'

/**
 * #4892.1 — une marque = une ligne. L'IA PROPOSE un regroupement d'affichage (`brandGroup`) ; les entités membres se
 * replient sous leur tête, DÉPLIABLES dans sa carte (garde #4892.3 : ni ville ni effectif ne s'inventent — ils sont
 * lus sur la ligne du membre reçue). Rien n'est fusionné : chaque SIREN reste distinct.
 * Un membre dont la tête n'est pas dans la liste reste affiché — une entité ne disparaît jamais sans sa tête.
 */
export function collapseBrandMembers(list: DiscoverCandidate[]): DiscoverCandidate[] {
  if (!list.some(c => c.brandGroup)) return list
  const bySiren = new Map(list.map(c => [c.siren, c]))
  return list
    .filter(c => !(c.brandGroup?.role === 'member' && bySiren.has(c.brandGroup.headSiren)))
    .map(c => {
      const group = c.brandGroup
      if (group?.role !== 'head') return c
      const members = group.members.map(m => {
        const row = bySiren.get(m.siren)
        return row ? { ...m, city: row.city, headcountRange: row.headcountRange } : m
      })
      return { ...c, brandGroup: { role: 'head' as const, members } }
    })
}
