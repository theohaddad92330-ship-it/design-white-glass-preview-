import type { InfiniteData } from '@tanstack/react-query'
import type { AccountListResponse } from '@bellum/contracts'
import { getCachedEntity, putCachedEntity } from '@/lib/cache/idb/repository'
import { versionedCacheKey } from '@/lib/cache/idb/versioned-key'

/**
 * ⚠️ Ce service n'a AUCUN appelant à ce jour (mesuré le 25/08/2026).
 *
 * Il est laissé en place, mais la clé passe par `versionedCacheKey` : le jour
 * où quelqu'un cherchera « est-ce qu'on met les comptes en cache ? » et le
 * branchera, il héritera du buster sans avoir à y penser. Sans ça, brancher ce
 * service ressusciterait le défaut que le Tome 7 §22.2 nomme — un état de panne
 * mis en cache qui survit à sa réparation — et personne ne le verrait avant la
 * production. Garde : GA-42.
 */
export async function getCachedAccountsList(key: string) {
  return getCachedEntity<InfiniteData<AccountListResponse>>('accounts', versionedCacheKey(key))
}

export async function saveCachedAccountsList(key: string, data: InfiniteData<AccountListResponse>) {
  await putCachedEntity('accounts', versionedCacheKey(key), data)
}
