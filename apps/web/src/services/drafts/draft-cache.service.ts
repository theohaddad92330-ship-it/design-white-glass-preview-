import { getCachedEntity, putCachedEntity } from '@/lib/cache/idb/repository'
import { versionedCacheKey } from '@/lib/cache/idb/versioned-key'

/**
 * ⚠️ Ce service n'a AUCUN appelant à ce jour (mesuré le 25/08/2026) — un
 * « brouillon » que rien n'écrit ni ne relit. Même remarque que pour le cache
 * de comptes : il porte le buster pour que le brancher un jour n'introduise pas
 * le défaut du Tome 7 §22.2. Garde : GA-42.
 */
export async function loadDraft<T>(draftKey: string) {
  return getCachedEntity<T>('drafts', versionedCacheKey(draftKey))
}

export async function saveDraft<T>(draftKey: string, draft: T) {
  await putCachedEntity('drafts', versionedCacheKey(draftKey), draft)
}
