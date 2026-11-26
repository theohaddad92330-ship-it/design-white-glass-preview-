import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import { readTabIdentity } from '@/features/auth/tab-identity'
import { getCacheDb } from './schema'

/**
 * L'instantané du cache est rangé PAR IDENTITÉ.
 *
 * Il tenait sous une clé unique, alors qu'IndexedDB est partagé par tous les
 * onglets d'une origine : l'onglet de démonstration écrasait l'instantané du
 * vrai compte, et au rechargement suivant chacun restaurait les données de
 * l'autre — dossiers, contacts, crédits (DEMO-01, audit terrain du 17/08).
 *
 * `anonymous` couvre le tout premier chargement d'un onglet, avant qu'une
 * identité soit connue : il n'y a alors rien à restaurer, ce qui coûte un
 * démarrage tiède et ne mélange rien.
 */
function snapshotKey(): string {
  return `query-client:${readTabIdentity() ?? 'anonymous'}`
}

// Max time we wait for IndexedDB before giving up on the cached snapshot.
// `PersistQueryClientProvider` keeps `isRestoring: true` — which pauses every
// `useQuery` — until `restoreClient` resolves. If the open OR the read hangs
// (another tab blocking the version upgrade, OS lock, corrupted store, a
// snapshot grown large enough to stall the read…), the whole app would freeze
// on a loader. Skipping the snapshot is always recoverable; hanging the UI is
// not — so the budget below covers the entire restore, not just the open.
const RESTORE_TIMEOUT_MS = 3000

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (handle) clearTimeout(handle)
  }
}

export function createIndexedDbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const db = await getCacheDb()
      await db.put('tanstack_query', client, snapshotKey())
    },
    restoreClient: async () => {
      try {
        // The budget covers the WHOLE restore, open AND read. It used to guard
        // only the open, leaving `db.get()` — the read plus the structured-clone
        // deserialize of the entire snapshot — unbounded. Since `isRestoring`
        // pauses every `useQuery` until this settles, an unbounded read has no
        // ceiling on how long the app stays empty.
        return await withTimeout(
          (async () => {
            const db = await getCacheDb()
            return (await db.get('tanstack_query', snapshotKey())) as PersistedClient | undefined
          })(),
          RESTORE_TIMEOUT_MS,
          'IDB restore',
        )
      } catch (err) {
        console.warn('[cache] restoreClient skipped:', err)
        return undefined
      }
    },
    removeClient: async () => {
      const db = await getCacheDb()
      await db.delete('tanstack_query', snapshotKey())
    },
  }
}

/**
 * #3068 / SG — un ré-semis de salle démo est API-only : `DemoResetService`
 * purge et re-sème la base, mais ne touche jamais l'instantané déjà écrit dans
 * IndexedDB par un visiteur PRÉCÉDENT. Or une salle du pool se reprend (bail
 * renouvelé, `mine`) ou se recycle (LRU) — deux visites successives du même
 * navigateur peuvent donc porter la MÊME identité (`session.user.id`), donc la
 * MÊME clé d'instantané, alors que le contenu serveur vient de changer.
 *
 * Appelée juste après `redeem()` réussi, AVANT le rechargement complet
 * (`DemoEntryPage`, `useDemoAccessForm`) : sans elle, le premier rendu après
 * le reload pourrait montrer un instant le dossier de la visite précédente,
 * le temps que la requête réseau (`staleTime` 5 min) rattrape.
 *
 * Scopée à l'identité passée — jamais `clearCacheDb()` (tout le magasin),
 * qui effacerait aussi l'instantané d'un vrai compte ouvert dans un autre
 * onglet de ce même navigateur (DEMO-01, audit terrain du 17/08).
 */
export async function clearPersistedQueryCache(userId: string): Promise<void> {
  try {
    // #3468 — même borne que `restoreClient` : l'ouverture peut ne JAMAIS se
    // résoudre (autre onglet, par exemple une session prod, qui tient la base
    // pendant une montée de version). Cette purge est appelée APRÈS un
    // `redeem()` réussi : sans borne, l'attente figeait le bouton « Accéder à la
    // démo » pour toujours. Purge manquée = on recharge quand même ; l'instantané
    // périmé se corrige par la requête réseau.
    await withTimeout(
      getCacheDb().then(db => db.delete('tanstack_query', `query-client:${userId}`)),
      RESTORE_TIMEOUT_MS,
      'IDB clear',
    )
  } catch (err) {
    console.warn('[cache] clearPersistedQueryCache skipped:', err)
  }
}
