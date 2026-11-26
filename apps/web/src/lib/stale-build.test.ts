import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import {
  isStaleBuildError,
  recoverFromStaleBuild,
  STALE_BUILD_RELOAD_KEY,
  installStaleBuildRecovery,
} from '@/lib/stale-build'
import { beginCriticalOperation, isCriticalOperationInFlight } from '@/lib/critical-operation-guard'

/** Replaces `window.location.reload` with a spy for the length of a test. */
function spyOnReload() {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
  return reload
}

describe('isStaleBuildError', () => {
  it.each([
    // Chrome / Edge
    'Failed to fetch dynamically imported module: https://app.bellum-ai.com/assets/index-a1b2c3.js',
    // Firefox
    'error loading dynamically imported module',
    // Safari
    'Importing a module script failed.',
    // Vite CSS preload helper
    'Unable to preload CSS for /assets/index-a1b2c3.css',
    // Webpack-style wording, still seen through third-party chunks
    'Loading chunk 42 failed.',
    // SPA fallback served index.html in place of a deleted chunk
    'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
  ])('recognises %s', message => {
    expect(isStaleBuildError(new Error(message))).toBe(true)
  })

  it.each(['Cannot read properties of undefined', 'Network request failed', 'boom'])(
    'does not claim an unrelated failure: %s',
    message => {
      expect(isStaleBuildError(new Error(message))).toBe(false)
    },
  )

  it('reads the message of a non-Error thrown value', () => {
    expect(isStaleBuildError('Failed to fetch dynamically imported module')).toBe(true)
    expect(isStaleBuildError(undefined)).toBe(false)
    expect(isStaleBuildError({ message: 'Loading chunk 3 failed' })).toBe(true)
  })
})

describe('recoverFromStaleBuild', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reloads once and remembers when it did', () => {
    const reload = spyOnReload()

    expect(recoverFromStaleBuild()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(STALE_BUILD_RELOAD_KEY)).toBe(String(Date.now()))
  })

  it('never reloads twice in a row — a chunk that is still missing must not loop', () => {
    const reload = spyOnReload()
    recoverFromStaleBuild()
    reload.mockClear()

    vi.advanceTimersByTime(5_000)
    expect(recoverFromStaleBuild()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads again for a LATER deploy, once the cooldown has passed', () => {
    const reload = spyOnReload()
    recoverFromStaleBuild()
    reload.mockClear()

    vi.advanceTimersByTime(10 * 60_000)
    expect(recoverFromStaleBuild()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads when the stored marker is unreadable (private mode, corrupt value)', () => {
    const reload = spyOnReload()
    sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, 'not-a-timestamp')

    expect(recoverFromStaleBuild()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  // #3822.5 — recette prod 07/10 : un lot d'enrichissement en vol s'est fait
  // recharger la page en plein milieu, perdant sélection et récapitulatif.
  it("diffère le rechargement tant qu'un lot payant est en vol, puis recharge à sa fin", () => {
    const reload = spyOnReload()
    const end = beginCriticalOperation()

    expect(recoverFromStaleBuild()).toBe(true)
    expect(reload).not.toHaveBeenCalled()
    expect(isCriticalOperationInFlight()).toBe(true)

    end()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('recharge tout de suite quand aucun lot ne tourne (comportement inchangé)', () => {
    const reload = spyOnReload()

    expect(recoverFromStaleBuild()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('installStaleBuildRecovery', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('reloads on the Vite preload-error event WITHOUT swallowing it', () => {
    const reload = spyOnReload()
    const teardown = installStaleBuildRecovery()

    const event = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(event)

    expect(reload).toHaveBeenCalledTimes(1)
    // #4009.2 — jamais `preventDefault()` : Vite résoudrait alors l'`import()` avec `undefined`.
    expect(event.defaultPrevented).toBe(false)
    teardown()
  })

  // #4009.2 — recette prod 11/10 : 1er chargement à froid de /accounts/<id>?tab=veille →
  // « Cannot read properties of undefined (reading 'component') ». L'assistant de préchargement de Vite
  // rend `undefined` quand l'écouteur a appelé `preventDefault()` ; le routeur lit `module.component`.
  it.each([
    ['au premier échec (rechargement déclenché)', false],
    ['pendant le délai de grâce (rechargement refusé)', true],
  ])("l'import qui échoue reste une erreur d'import, jamais un module `undefined` — %s", async (_label, cooling) => {
    spyOnReload()
    if (cooling) sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, String(Date.now()))
    const teardown = installStaleBuildRecovery()
    const chunkError = new TypeError('Failed to fetch dynamically imported module: /assets/_id-x.js')
    // Le contrat de `__vitePreload` (vite/src/node/plugins/importAnalysisBuild.ts) : événement annulable,
    // l'erreur n'est relancée que si personne n'a empêché le comportement par défaut.
    const vitePreload = async (base: () => Promise<{ component: unknown }>) =>
      base().catch(error => {
        const event = new Event('vite:preloadError', { cancelable: true })
        window.dispatchEvent(event)
        if (!event.defaultPrevented) throw error
      })

    const load = vitePreload(() => Promise.reject(chunkError)).then(
      module => (module as { component: unknown }).component,
    )

    await expect(load).rejects.toBe(chunkError)
    teardown()
  })

  it('is idempotent — a second install stacks no listener', () => {
    const reload = spyOnReload()
    const first = installStaleBuildRecovery()
    const second = installStaleBuildRecovery()

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))

    expect(reload).toHaveBeenCalledTimes(1)
    first()
    second()
  })
})
