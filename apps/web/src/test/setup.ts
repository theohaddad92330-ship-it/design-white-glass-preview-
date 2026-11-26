import '@testing-library/jest-dom'
import { vi } from 'vitest'
// ORDER MATTERS: the localStorage polyfill must be evaluated before `@/i18n`
// (the language detector memoizes localStorage availability on first use).
import './localstorage-polyfill'
// ...and the FR language pin must run before `@/i18n` too: the initial-language
// resolver now also consults `navigator.language` (jsdom = 'en-US'), so without
// a stored preference tests would default to EN. This keeps them on FR.
import './i18n-default-language'
// Initialize the i18n singleton so `useTranslation()` / `t()` resolve in tests
// (defaults to FR — the product default language).
import '@/i18n'

// happy-dom 20.14 rejette `animation.finished` (AbortError « The animation was canceled ») quand
// motion-dom annule une animation au démontage : rejet non géré qui fait échouer le run. On rend
// `finished` non rejetant (il se résout à l'annulation), sans couper les animations (les sorties
// d'AnimatePresence doivent continuer à retirer leurs nœuds).
const rawAnimate = Element.prototype.animate
if (typeof rawAnimate === 'function') {
  Element.prototype.animate = function patchedAnimate(this: Element, ...args: Parameters<typeof rawAnimate>) {
    const animation = rawAnimate.apply(this, args)
    let raw: Promise<Animation> = animation.finished
    Object.defineProperty(animation, 'finished', {
      configurable: true,
      get: () => {
        const settled = raw.catch(() => animation)
        return settled
      },
      set: (next: Promise<Animation>) => {
        raw = next
        void next.catch(() => undefined)
      },
    })
    void raw.catch(() => undefined)
    return animation
  }
}

// Mock IntersectionObserver (needed by framer-motion whileInView)
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor() {}
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

// Mock ResizeObserver (needed by some UI components)
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
}))

// Mock @/lib/socket
vi.mock('@/lib/socket', () => ({
  connectToJob: vi.fn(),
  disconnectSocket: vi.fn(),
  // #3666 — `useAnalysisStatusSync` relit l'état réel à chaque reconnexion du socket.
  onSocketConnect: vi.fn(() => () => {}),
}))

// Mock @/lib/api — must export every symbol consumed at module-eval time.
// `session-manager.ts` calls `setAuthExpiredHandler` in its constructor (run
// when the singleton is instantiated on import), so omitting it crashes test
// collection for any view that transitively imports `useAuth`.
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  setAuthExpiredHandler: vi.fn(),
  refreshTokensOnce: vi.fn().mockResolvedValue(false),
  // `authApi.refresh` passe par cette porte (session tenue 24 h) ; « on ne sait
  // pas » est la seule réponse neutre pour une vue qui n'en parle pas.
  refreshSessionShared: vi.fn().mockResolvedValue({ status: 'unavailable' }),
  // Kept behaviourally identical to the real class: callers branch on
  // `instanceof ApiError` + `.code` to localise business failures.
  ApiError: class ApiError extends Error {
    readonly status: number
    readonly code?: string
    // `details` porte le CORPS de la réponse d'erreur : certaines erreurs sont
    // des données, pas une phrase (le 409 du verrou de l'organigramme porte son
    // diff). Le mock doit l'accepter, sinon un test qui simule un conflit
    // vérifierait un objet que le code de production n'a jamais vu.
    readonly details?: unknown
    constructor(message: string, status: number, code?: string, details?: unknown) {
      super(message, { cause: status })
      this.name = 'ApiError'
      this.status = status
      this.code = code
      this.details = details
    }
  },
}))

// Mock @/lib/account-pdf — PDF generation pulls heavy native deps unsuitable for jsdom.
vi.mock('@/lib/account-pdf/export', () => ({
  exportAccountPdf: vi.fn().mockResolvedValue(undefined),
}))

// #2090.35 / #2074.9 — même raison : le PDF dédié de l'audit commercial.
vi.mock('@/lib/audit-pdf/export', () => ({
  exportAuditPdf: vi.fn().mockResolvedValue(undefined),
}))

// Mock @/lib/export-csv
vi.mock('@/lib/export-csv', () => ({
  generateCSV: vi.fn().mockReturnValue(''),
  downloadCSV: vi.fn(),
  // #4016 L11 — le jumeau JSON (export de masse des besoins).
  downloadJSON: vi.fn(),
}))

// #2081.14 — la règle d'espace « qui peut exporter » laisse sortir les données
// par défaut, comme un espace qui n'a rien posé : une vue qui ne parle pas de
// la règle garde ses boutons d'export. Les tests de la règle surchargent
// `useDataExit` ; `workspaceRuleRefusalText` reste le vrai.
vi.mock('@/lib/data-exit', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDataExit: vi.fn(() => ({ allowed: true, grant: {} })),
}))

// #4158.52 — le badge « Ne pas contacter » des LISTES lit la liste de l'espace par une requête
// partagée : les tests de lignes de contacts n'ont pas de QueryClient, il reste muet par défaut.
// Son propre test prend le vrai composant (`importActual`).
vi.mock('@/features/team-guardrails/components/DoNotContactBadge', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DoNotContactListBadge: () => null,
}))

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()

/*
 * L'API Pointer Capture, absente de jsdom.
 *
 * Radix l'appelle pour décider si un `pointerdown` ouvre son menu. Sans ces
 * trois stubs, un `<Select>` (et tout ce qui repose dessus, à commencer par
 * `SelectField`) reste `aria-expanded="false"` après un clic : le test ne
 * trouve aucune option et échoue en disant « rôle option introuvable », ce
 * qui ressemble à un bug du composant alors que c'est un trou de
 * l'environnement. Le clavier, lui, fonctionnait — d'où un fichier de test à
 * moitié vert, qui est le pire des diagnostics.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
}

// Mock document.elementFromPoint (not implemented in jsdom). `input-otp` schedules
// a password-manager badge probe that calls it on a timer; without this stub the
// probe throws an unhandled error AFTER a test completes and fails the file.
document.elementFromPoint = vi.fn(() => null) as unknown as typeof document.elementFromPoint

// The pristine `fetch`, captured before the mock below shadows it. Tests that
// need genuine bytes (see `account-pdf` — yoga-layout inlines its WASM as a
// `data:` URL and reads it back through `fetch`) restore or delegate to this.
export const realFetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)

/*
 * Mock fetch.
 *
 * The stub must be a *complete* Response-like: consumers legitimately call
 * `arrayBuffer()`/`text()`/`blob()`, not just `json()`. Returning a partial
 * object surfaces as `response.arrayBuffer is not a function` from deep inside
 * a dependency, which reads like a Node/runtime incompatibility and is anything
 * but — it's this mock. `data:` URLs are delegated to the real implementation:
 * they carry their own payload, so intercepting them corrupts callers that
 * inline binary assets (yoga-layout's WASM module).
 */
global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('data:')) return realFetch(input, init)
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    json: async () => ({}),
    text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob([]),
  } as unknown as Response
}) as unknown as typeof globalThis.fetch
