import type { TargetList } from '@bellum/contracts'

export type ListAudience = 'contacts' | 'accounts'

/**
 * Théo B c2-mes-listes.A1 — sous quel onglet « Contacts / Comptes » une liste se range.
 * Une liste mixte va sous « Comptes » (elle porte les comptes ET leurs contacts) ; une liste
 * sans élément vivant (`type` nul) n'a pas encore d'audience, elle attend sous « Contacts ».
 */
export function listAudience(list: Pick<TargetList, 'type'>): ListAudience {
  return list.type === 'accounts' || list.type === 'mixed' ? 'accounts' : 'contacts'
}

type Bucket = { active: TargetList[]; archived: TargetList[] }

/** Les listes rangées par audience, les archivées à part (on archive, on ne supprime pas). */
export function splitContactLists(lists: readonly TargetList[]): Record<ListAudience, Bucket> {
  const out: Record<ListAudience, Bucket> = {
    contacts: { active: [], archived: [] },
    accounts: { active: [], archived: [] },
  }
  for (const list of lists) {
    out[listAudience(list)][list.status === 'archived' ? 'archived' : 'active'].push(list)
  }
  return out
}
