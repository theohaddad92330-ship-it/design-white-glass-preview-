import { getCacheDb } from './schema'

type CachedStore =
  | 'accounts'
  | 'contacts'
  | 'pipeline_runs'
  | 'generated_assets'
  | 'drafts'
  | 'profiles'
  | 'attack_angles'
  | 'action_plans'
  | 'user_credits'
  | 'rag_documents'
  | 'query_snapshots'

export async function putCachedEntity<T>(store: CachedStore, key: string, data: T) {
  const db = await getCacheDb()
  await db.put(store, { key, data, updatedAt: Date.now() }, key)
}

export async function getCachedEntity<T>(store: CachedStore, key: string) {
  const db = await getCacheDb()
  const row = await db.get(store, key)
  return row?.data as T | undefined
}
