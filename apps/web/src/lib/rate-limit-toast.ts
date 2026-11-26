import { resolveProductScreen } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { trackErrorShown } from '@/lib/product-tracker'

export function parseApiStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/API error: (\d{3})/)
  return match ? Number(match[1]) : null
}

// #1687.3 — LE BANDEAU D'ÉCHEC DE REQUÊTE. `notifyIfRateLimited` est câblé
// GLOBALEMENT (`lib/api.ts` sur chaque `fetch` direct, `lib/api/query-client.ts`
// sur TOUTE requête/mutation TanStack Query) : un seul appelant couvre donc
// tous les 429 de l'application, pas un écran choisi au hasard.
//
// `errorCode` est le littéral fixe `RATE_LIMITED` — jamais `error.message`
// (qui porte la route et le statut de l'appel, pas une donnée de compte, mais
// un message reste un texte libre, jamais un code fermé). `screen` se lit sur
// `window.location.pathname` (pas de contexte de routeur ici, ce fichier
// n'est pas un composant) et suit le même repliement que `router.tsx` :
// `/accounts/<uuid>` devient `/accounts/$id`.
const UNKNOWN_TOAST_SCREEN = '(hors catalogue)'

function currentScreen(): string {
  if (typeof window === 'undefined') return UNKNOWN_TOAST_SCREEN
  return resolveProductScreen(window.location.pathname)?.route ?? UNKNOWN_TOAST_SCREEN
}

/**
 * Surface a 429 to the user as a single toast. Coalesces repeated calls
 * within a short window so a burst of concurrent failed requests doesn't
 * spam the UI. Use as a fire-and-forget notifier; callers must still
 * handle the error themselves.
 */
let lastToastAt = 0
const COALESCE_WINDOW_MS = 5_000

export function notifyIfRateLimited(error: unknown): void {
  if (parseApiStatus(error) !== 429) return
  const now = Date.now()
  if (now - lastToastAt < COALESCE_WINDOW_MS) return
  lastToastAt = now
  // Defer to a microtask so we never call sonner setState mid-render — TanStack
  // Query's fetchFn can fire during a render path (StrictMode/Suspense), and
  // calling toast() inline would warn about updating a component while rendering.
  queueMicrotask(() => {
    toast.warning(i18n.t('common:toast.rateLimited'), {
      duration: 4_000,
      id: 'api-rate-limit',
    })
    // #1687.3 — ÉMIS ici, avec le toast, jamais avant : un appel coalescé (la
    // fenêtre de 5 s au-dessus) ne montre rien de NEUF à l'utilisateur, donc
    // n'émet rien non plus — l'émission suit ce qui est VU, pas ce qui est
    // détecté.
    trackErrorShown(currentScreen(), 'RATE_LIMITED')
  })
}
