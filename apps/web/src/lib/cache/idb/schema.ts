import { openDB, type DBSchema } from 'idb'

const DB_NAME = 'bellum-web-cache'
const DB_VERSION = 3
const CACHE_STORE_NAMES = [
  'accounts',
  'contacts',
  'pipeline_runs',
  'generated_assets',
  'drafts',
  'profiles',
  'attack_angles',
  'action_plans',
  'user_credits',
  'rag_documents',
  'query_snapshots',
  'tanstack_query',
] as const

type CachedRow = { key: string; data: unknown; updatedAt: number }
type CachedStoreSchema = { key: string; value: CachedRow; indexes: { 'by-updatedAt': number } }

interface BellumCacheDB extends DBSchema {
  accounts: CachedStoreSchema
  contacts: CachedStoreSchema
  pipeline_runs: {
    key: string
    value: CachedRow
    indexes: { 'by-status': string; 'by-updatedAt': number }
  }
  generated_assets: CachedStoreSchema
  drafts: CachedStoreSchema
  profiles: CachedStoreSchema
  attack_angles: CachedStoreSchema
  action_plans: CachedStoreSchema
  user_credits: CachedStoreSchema
  rag_documents: CachedStoreSchema
  query_snapshots: CachedStoreSchema
  tanstack_query: { key: string; value: unknown }
}

let dbPromise: ReturnType<typeof openDB<BellumCacheDB>> | null = null

export function getCacheDb() {
  if (!dbPromise) {
    dbPromise = openDB<BellumCacheDB>(DB_NAME, DB_VERSION, {
      // Fires when another tab requests a higher version while we hold the
      // current one open — close to let the upgrade proceed instead of
      // deadlocking that tab on `openDB`.
      blocking() {
        dbPromise?.then(db => db.close()).catch(() => {})
        dbPromise = null
      },
      // Fires in the tab requesting the upgrade when another tab is still
      // holding the previous version. Surface it so we can debug; the
      // `restoreClient` timeout will eventually unstick the loader.
      blocked() {
        console.warn('[cache] IDB upgrade blocked by another tab holding the previous version')
      },
      upgrade(db) {
        const cachedStores = [
          'accounts',
          'contacts',
          'generated_assets',
          'drafts',
          'profiles',
          'attack_angles',
          'action_plans',
          'user_credits',
          'rag_documents',
          'query_snapshots',
        ] as const
        for (const name of cachedStores) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name)
            store.createIndex('by-updatedAt', 'updatedAt')
          }
        }
        if (!db.objectStoreNames.contains('pipeline_runs')) {
          const store = db.createObjectStore('pipeline_runs')
          store.createIndex('by-updatedAt', 'updatedAt')
          store.createIndex('by-status', 'status')
        }
        if (!db.objectStoreNames.contains('tanstack_query')) db.createObjectStore('tanstack_query')
      },
    })
  }
  return dbPromise
}

export async function clearCacheDb(): Promise<void> {
  const db = await getCacheDb()
  await Promise.all(CACHE_STORE_NAMES.map(storeName => db.clear(storeName)))
}
