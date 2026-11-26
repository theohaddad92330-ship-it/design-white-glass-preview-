import { useSyncExternalStore } from 'react'

/**
 * perf P3 (29/09/2026) — LE SEUL ENDROIT où l'on décide « la page est calme ».
 *
 * Mesuré en production : chaque page payait, avant son propre contenu, les
 * requêtes du gabarit racine (`/laura/plan` 0,8-2,5 s, `/onboarding/state`,
 * `/tool-registry`…). Elles ne sont pas nécessaires au premier rendu : elles
 * alimentent un bandeau, une carte, un guide. Les lancer en même temps que le
 * contenu de la page met la file d'attente de l'API (pool, throttler) au
 * service du décor.
 *
 * `useDeferredEnabled()` rend `false` jusqu'à ce que la page soit calme :
 * `DEFERRED_DELAY_MS` après le premier rendu authentifié, puis au prochain
 * instant de repos du navigateur (`requestIdleCallback`). Il vaut ensuite
 * `true` pour toute la vie de l'onglet — c'est un état de module, pas de
 * composant, donc un démontage/remontage ne relance pas le délai.
 *
 * Usage : `enabled: baseEnabled && useDeferredEnabled()` sur une requête, ou
 * `if (!calm) return` dans un effet. `useDeferredEnabled(true)` (« maintenant »)
 * ouvre la porte tout de suite quand l'utilisateur a DÉJÀ besoin du résultat
 * (il ouvre le chat, le dock…) : différer, jamais supprimer.
 *
 * ⚠️ En test (`MODE === 'test'`) la porte est ouverte d'emblée, pour que les
 * tests de composants existants n'aient pas à attendre un minuteur. La garde
 * `racine-sans-requete-avant-rendu` la referme avec `deferralForTests(true)`.
 */
const DEFERRED_DELAY_MS = 2000

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
}

let calm = import.meta.env.MODE === 'test'
let armed = false
const listeners = new Set<() => void>()

function open(): void {
  if (calm) return
  calm = true
  listeners.forEach(l => l())
}

function arm(): void {
  if (armed || calm || typeof window === 'undefined') return
  armed = true
  setTimeout(() => {
    const idle = (window as IdleWindow).requestIdleCallback
    if (idle) idle(open, { timeout: 2000 })
    else open()
  }, DEFERRED_DELAY_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  arm()
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): boolean {
  return calm
}

/** `now` : le résultat est déjà demandé par l'utilisateur — pas d'attente. */
export function useDeferredEnabled(now = false): boolean {
  const isCalm = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return isCalm || now
}

/** Tests seulement : referme (`true`) ou rouvre (`false`) la porte. */
export function deferralForTests(enforce: boolean): void {
  calm = !enforce
  armed = false
  listeners.forEach(l => l())
}
