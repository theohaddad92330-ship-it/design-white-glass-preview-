import { useCallback, useEffect, useRef, useState } from 'react'
import {
  newQueuedMessage,
  readPersistedQueue,
  markQueuedSent,
  SEND_QUEUE_MAX,
  sendQueueStorageKey,
  unmarkQueuedSent,
  writePersistedQueue,
  type QueuedMessage,
  type QueueSuspension,
} from './send-queue'

interface QueueState {
  /** La clé pour laquelle `items` a été chargée : garde l'écriture de la file d'un fil dans celle d'un autre. */
  key: string | null
  items: QueuedMessage[]
  suspension: QueueSuspension | null
}

/** Délai après lequel le verrou d'envoi se lève si `busy` n'a jamais bougé. */
const ARMED_RELEASE_MS = 1500

/** `chat:<user>:new` → `chat:<user>:<id>` : la même conversation, qui vient de recevoir son identifiant. */
function isDraftToThread(from: string, to: string): boolean {
  const suffix = ':new'
  if (!from.endsWith(suffix) || to.endsWith(suffix)) return false
  return to.startsWith(from.slice(0, -suffix.length) + ':')
}

const EMPTY: QueueState = { key: null, items: [], suspension: null }

function loadState(storageKey: string | null): QueueState {
  if (!storageKey) return { key: null, items: [], suspension: null }
  const items = readPersistedQueue(sendQueueStorageKey(storageKey))
  // #4066.5 — une file retrouvée après rechargement attend un geste : elle ne part jamais seule.
  return { key: storageKey, items, suspension: items.length ? { kind: 'restored' } : null }
}

export interface SendQueue {
  items: readonly QueuedMessage[]
  suspension: QueueSuspension | null
  isFull: boolean
  /** `false` si la file est pleine (SEND_QUEUE_MAX) ou le texte vide. */
  enqueue: (text: string) => boolean
  remove: (id: string) => void
  edit: (id: string, text: string) => void
  /** #4066.4 — l'échec de la réponse en cours : la file attend, l'échec est nommé. */
  suspend: (reason: string) => void
  resume: () => void
  clear: () => void
}

/**
 * #4066.1 — UN SEUL hook pour `/chat` et la bulle `LauraDock`.
 *
 * `busy` : une réponse est en cours. `dispatch` envoie le message de tête et renvoie
 * `false` s'il n'a pas pu partir (alors il retourne en tête et la file se suspend).
 * La file avance quand `busy` retombe, sauf suspension.
 */
export function useSendQueue(options: {
  storageKey: string | null
  busy: boolean
  dispatch: (text: string) => boolean
}): SendQueue {
  const { storageKey, busy } = options
  const dispatchRef = useRef(options.dispatch)
  dispatchRef.current = options.dispatch
  const [state, setState] = useState<QueueState>(() => loadState(storageKey))
  const stateRef = useRef(state)
  stateRef.current = state

  // Changement de fil : on relit la file de CE fil.
  // #4066.6 — la conversation neuve reçoit son id PENDANT sa première réponse : la file ne reste pas
  // sous `:new` (où elle serait perdue et où un message déjà parti resterait), elle suit le fil.
  useEffect(() => {
    const current = stateRef.current
    if (current.key === storageKey) return
    if (storageKey && current.key && busy && current.items.length > 0 && isDraftToThread(current.key, storageKey)) {
      writePersistedQueue(sendQueueStorageKey(current.key), [])
      setState({ ...current, key: storageKey })
      return
    }
    setState(loadState(storageKey))
    // `busy` n'est volontairement pas une dépendance : il ne décide qu'au moment où la clé change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  useEffect(() => {
    if (state.key && state.key === storageKey) writePersistedQueue(sendQueueStorageKey(state.key), state.items)
  }, [state.items, state.key, storageKey])

  const active = state.key === storageKey ? state : EMPTY

  // Un message vient de partir : on attend que `busy` passe à vrai avant d'en lancer un autre
  // (sinon deux messages partiraient dans le même rendu). Filet : si `busy` ne bouge jamais
  // (envoi finalement ignoré par l'hôte), le verrou se lève et le message n'est pas perdu de vue.
  const armedRef = useRef(false)
  useEffect(() => {
    if (busy) armedRef.current = false
  }, [busy])

  // #4066.2 — la réponse en cours est finie : le message suivant part, dans l'ordre.
  useEffect(() => {
    if (
      busy ||
      armedRef.current ||
      active.suspension ||
      active.items.length === 0 ||
      !state.key ||
      state.key !== storageKey
    )
      return
    const [head] = active.items
    if (!head) return
    // #4097 — le message sort de la file PERSISTÉE au moment où il part (écriture synchrone, avant l'envoi) :
    // un rechargement pendant ou juste après l'envoi ne le re-propose jamais.
    const persistKey = sendQueueStorageKey(state.key)
    markQueuedSent(persistKey, head.id)
    writePersistedQueue(persistKey, active.items.slice(1))
    setState(previous => ({ ...previous, items: previous.items.slice(1) }))
    armedRef.current = true
    window.setTimeout(() => {
      if (!armedRef.current) return
      armedRef.current = false
      // Un nouvel objet `items` : sans lui, l'effet d'avancement ne se réévalue pas et la file reste figée.
      setState(previous => ({ ...previous, items: [...previous.items] }))
    }, ARMED_RELEASE_MS)
    if (!dispatchRef.current(head.text)) {
      armedRef.current = false
      // #4097 — l'envoi n'est pas parti : le message redevient restaurable.
      unmarkQueuedSent(persistKey, head.id)
      writePersistedQueue(persistKey, active.items)
      setState(previous => ({
        ...previous,
        items: [head, ...previous.items],
        suspension: { kind: 'refused', reason: '' },
      }))
    }
  }, [busy, active.items, active.suspension, state.key, storageKey])

  const enqueue = useCallback((text: string) => {
    const trimmed = text.trim()
    const current = stateRef.current
    if (!trimmed || current.items.length >= SEND_QUEUE_MAX) return false
    const next = { ...current, items: [...current.items, newQueuedMessage(trimmed)] }
    stateRef.current = next
    setState(next)
    return true
  }, [])

  const remove = useCallback((id: string) => {
    setState(previous => {
      const items = previous.items.filter(item => item.id !== id)
      return { ...previous, items, suspension: items.length ? previous.suspension : null }
    })
  }, [])

  const edit = useCallback((id: string, text: string) => {
    const trimmed = text.trim()
    setState(previous => ({
      ...previous,
      // Un texte vidé retire le message : jamais un message vide qui partirait.
      items: trimmed
        ? previous.items.map(item => (item.id === id ? { ...item, text: trimmed } : item))
        : previous.items.filter(item => item.id !== id),
    }))
  }, [])

  const suspend = useCallback((reason: string) => {
    // Sans message en attente, il n'y a rien à suspendre : l'échec se lit dans le fil.
    setState(previous => (previous.items.length ? { ...previous, suspension: { kind: 'failure', reason } } : previous))
  }, [])

  const resume = useCallback(() => {
    setState(previous => ({ ...previous, suspension: null }))
  }, [])

  const clear = useCallback(() => {
    setState(previous => ({ ...previous, items: [], suspension: null }))
  }, [])

  return {
    items: active.items,
    suspension: active.suspension,
    isFull: active.items.length >= SEND_QUEUE_MAX,
    enqueue,
    remove,
    edit,
    suspend,
    resume,
    clear,
  }
}
