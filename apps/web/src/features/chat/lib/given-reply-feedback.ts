import { useEffect, useSyncExternalStore } from 'react'
import type { ReplyFeedbackItem } from '@bellum/contracts'
import { listMyReplyFeedback } from '../api/replyFeedbackApi'

/**
 * #1919.14 / #1919.17 — LES RETOURS DÉJÀ DONNÉS, REMONTRÉS SOUS LEURS RÉPONSES.
 *
 * Un fil relu affiche chaque réponse de Laura avec son pied ; chacun doit savoir
 * si la personne l'a déjà notée. Une requête PAR réponse serait une rafale à
 * chaque ouverture de fil : la liste est donc lue UNE fois (partagée par tous les
 * pieds), puis tenue à jour localement par les gestes de la session.
 *
 * ⚠️ Pourquoi un petit magasin et pas React Query : `ReplyFooter` est monté par
 * `Chat`, dont les suites de test tournent SANS `QueryClientProvider` et
 * remplacent chaque hook réseau à la main. Un `useQuery` ici ferait tomber
 * quatre fichiers de test qui ne parlent pas du sujet — le défaut « hook réseau
 * dans un composant largement monté » que ce dépôt a déjà payé.
 *
 * Une lecture ratée n'affiche RIEN : ni « aucun retour » (ce serait un zéro
 * qui ment), ni une panne sous chaque réponse. Elle se retente au montage
 * suivant.
 */
const STALE_MS = 5 * 60 * 1000

let byDigest = new Map<string, ReplyFeedbackItem>()
let loadedAt: number | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function load() {
  if (loading) return
  if (loadedAt !== null && Date.now() - loadedAt < STALE_MS) return
  loading = listMyReplyFeedback()
    .then(items => {
      // La liste arrive du plus récent au plus ancien : le premier retour d'une
      // réponse est son dernier avis.
      const next = new Map<string, ReplyFeedbackItem>()
      for (const entry of items) if (!next.has(entry.replyDigest)) next.set(entry.replyDigest, entry)
      // Un geste de la session, plus récent que la lecture, garde la main.
      for (const [digest, local] of byDigest) {
        const remote = next.get(digest)
        if (!remote || remote.createdAt < local.createdAt) next.set(digest, local)
      }
      byDigest = next
      loadedAt = Date.now()
      emit()
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null
    })
}

/** Le dernier retour de la personne sur cette réponse, ou `null`. `enabled: false` = aucune lecture. */
export function useGivenReplyFeedback(digest: string, enabled: boolean): ReplyFeedbackItem | null {
  useEffect(() => {
    if (enabled) load()
  }, [enabled])
  return useSyncExternalStore(
    subscribe,
    () => (enabled ? (byDigest.get(digest) ?? null) : null),
    () => null,
  )
}

export function rememberGivenReplyFeedback(entry: ReplyFeedbackItem) {
  byDigest = new Map(byDigest).set(entry.replyDigest, entry)
  emit()
}

export function forgetGivenReplyFeedback(digest: string) {
  const next = new Map(byDigest)
  next.delete(digest)
  byDigest = next
  emit()
}

/** Tests seulement : un magasin de module survit d'un test à l'autre. */
export function resetGivenReplyFeedbackForTests() {
  byDigest = new Map()
  loadedAt = null
  loading = null
}
