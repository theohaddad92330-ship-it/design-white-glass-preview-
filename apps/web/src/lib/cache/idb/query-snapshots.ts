import { useEffect, useRef } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { readTabIdentity } from '@/features/auth/tab-identity'
import { getCachedEntity, putCachedEntity } from './repository'

/**
 * La clé d'un instantané porte l'IDENTITÉ de l'onglet.
 *
 * IndexedDB est partagé par tous les onglets d'une origine, et toutes les clés
 * de requête ne portent pas l'utilisateur : `['accounts']` s'écrivait donc au
 * même endroit pour un vrai compte et pour un visiteur de démonstration, et le
 * second à recharger lisait les dossiers du premier (DEMO-01, audit du 17/08).
 */
/**
 * Et elle porte aussi la VERSION du code déployé.
 *
 * Le premier étage de cache (le persister TanStack, `App.tsx`) a son buster
 * depuis l'incident du 17/08. Celui-ci ne l'avait pas : un instantané écrit
 * avant un déploiement était réinjecté après, et l'écran rejouait un état de
 * panne que le déploiement venait justement de réparer. C'est le quatrième des
 * six pièges du PDF 7, et le seul qu'on avait à moitié corrigé.
 *
 * Les clés d'une version précédente ne sont pas purgées : elles cessent
 * simplement d'être lues, et le nettoyage périodique d'IndexedDB s'en charge.
 * Purger au démarrage retarderait le premier rendu pour économiser des octets.
 */
/**
 * La version du build, ou `dev` hors de Vite.
 *
 * `__CODE_VERSION_ID__` est injecté par `define` : il n'existe ni sous vitest,
 * ni dans un rendu serveur. Le lire sans garde faisait exploser au montage tout
 * composant qui hydrate un instantané — six tests sont tombés d'un coup, et le
 * message (« __CODE_VERSION_ID__ is not defined ») ne désignait pas le cache.
 */
const BUILD_VERSION = typeof __CODE_VERSION_ID__ === 'string' ? __CODE_VERSION_ID__ : 'dev'

export const toSnapshotKey = (queryKey: readonly unknown[]) =>
  `${BUILD_VERSION}|${readTabIdentity() ?? 'anonymous'}|${JSON.stringify(queryKey)}`

export async function getQuerySnapshot<T>(queryKey: readonly unknown[]) {
  return getCachedEntity<T>('query_snapshots', toSnapshotKey(queryKey))
}

/**
 * Écrire un instantané est un geste de CONFORT : il ne casse jamais l'écran
 * qui l'écrit.
 *
 * Les onze appelants l'écrivent en `void saveQuerySnapshot(...)` — ils ne
 * l'attendent pas. Mais `void` ne traite AUCUN rejet : quand IndexedDB est
 * absent (navigation privée, stockage bloqué par une politique d'entreprise,
 * et jsdom sous vitest), `openDB` lève, et ce rejet n'a personne pour
 * l'attraper. En CI il a fait tomber un shard entier avec 3 754 tests VERTS ;
 * en production il remonte comme une panne de l'écran, alors que rien de ce
 * que l'utilisateur voit n'a échoué — la donnée est là, elle vient du réseau,
 * seule sa copie hors-ligne manque.
 *
 * La politique vit ICI plutôt qu'en onze `.catch(() => {})` recopiés : le
 * douzième appelant serait écrit sans. Le silence est le même que celui de
 * `hydrateFromSnapshot` en lecture.
 */
export async function saveQuerySnapshot<T>(queryKey: readonly unknown[], data: T) {
  try {
    await putCachedEntity('query_snapshots', toSnapshotKey(queryKey), data)
  } catch {
    // Pas de cache hors-ligne pour cette requête. L'écran, lui, a sa donnée.
  }
}

async function hydrateFromSnapshot<T>(qc: QueryClient, queryKey: readonly unknown[]) {
  if (qc.getQueryData(queryKey)) return
  const snap = await getQuerySnapshot<T>(queryKey).catch(() => undefined)
  if (snap === undefined) return
  if (!qc.getQueryData(queryKey)) qc.setQueryData(queryKey, snap)
}

/**
 * Seeds the queryClient with the last known snapshot for `queryKey` (read
 * from IndexedDB) when the queryClient doesn't already have data for it.
 *
 * Defensive fallback for cases where the `PersistQueryClientProvider`
 * restore was skipped (timeout, error) or evicted (`gcTime`). The seed
 * arrives in a `useEffect` so it isn't synchronous — components still
 * paint a loader on the very first render — but subsequent renders show
 * cached data instantly and avoid a network round-trip.
 *
 * The effect's dep array uses `toSnapshotKey(queryKey)` (a stable string)
 * instead of `queryKey` itself, so a fresh array identity on every render
 * does not retrigger the hydration.
 */
export function useHydrateFromSnapshot<T>(queryKey: readonly unknown[]) {
  const qc = useQueryClient()
  const keyStr = toSnapshotKey(queryKey)
  const keyRef = useRef(queryKey)
  keyRef.current = queryKey
  useEffect(() => {
    void hydrateFromSnapshot<T>(qc, keyRef.current)
  }, [qc, keyStr])
}
