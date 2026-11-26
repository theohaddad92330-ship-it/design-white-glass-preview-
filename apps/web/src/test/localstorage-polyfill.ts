/**
 * The vitest jsdom environment exposes a `window.localStorage` object without
 * functional methods (`getItem`/`setItem`/`removeItem` are undefined). The
 * i18next language detector feature-detects localStorage ONCE (memoized), so a
 * working implementation must be installed BEFORE `@/i18n` is imported.
 *
 * This module must therefore be imported before `@/i18n` in `setup.ts`.
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
  }
}

if (typeof window !== 'undefined' && typeof window.localStorage?.setItem !== 'function') {
  Object.defineProperty(window, 'localStorage', {
    value: createMemoryStorage(),
    writable: true,
    configurable: true,
  })
}
