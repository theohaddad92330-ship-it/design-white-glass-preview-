import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Défaut mesuré en prod, passage 12 (17/09/2026) — `/welcome` INATTEIGNABLE
 * par son URL pour un compte dont l'onboarding est terminé DEPUIS LONGTEMPS :
 * deux chargements de l'URL finissaient sur `/chat`.
 *
 * La cause : le garde comparait `state.status` à `'completed'` en dur. Un
 * compte qui a reporté le questionnaire (« Plus tard », `skipped_at` posé)
 * n'atteint jamais ce statut alors que son onboarding est bien terminé au
 * sens produit — il était donc renvoyé vers `/onboarding`, dont le garde
 * (juste, déjà testé dans `onboarding-index-route.test.ts`) le rebondit
 * ensuite vers `/chat` puisque `needsOnboarding` répond `false` pour lui.
 *
 * Le fichier vit hors de `src/routes/` à dessein : le générateur de routes
 * TanStack scanne ce dossier et transformerait un `*.test.ts` en route (même
 * convention que `onboarding-index-route.test.ts`).
 */
const { getState, getMine, ensureLoaded } = vi.hoisted(() => ({
  getState: vi.fn(),
  getMine: vi.fn(),
  ensureLoaded: vi.fn(),
}))

vi.mock('@/features/auth/session-manager', () => ({ sessionManager: { ensureLoaded } }))
vi.mock('@/features/credits/api', () => ({ creditsApi: { getMine } }))
vi.mock('@/features/onboarding/api', () => ({ onboardingApi: { getState } }))
// L'écran n'est pas rendu ici : ce test interroge la DÉCISION du garde.
vi.mock('@/features/welcome/view/WelcomeScreen', () => ({ WelcomeScreen: () => null }))

/** Joue `beforeLoad` et rend la destination de la redirection lancée, ou
 *  `null` quand le garde laisse l'écran s'afficher — voir
 *  `onboarding-index-route.test.ts` pour la raison de lire `thrown.options.to`. */
async function decide(): Promise<string | null> {
  const { Route } = await import('@/routes/welcome')
  const beforeLoad = Route.options.beforeLoad as () => Promise<void>
  try {
    await beforeLoad()
    return null
  } catch (thrown) {
    const target = (thrown as { options?: { to?: string } }).options?.to
    if (typeof target !== 'string') throw thrown // une vraie erreur n'est pas une décision
    return target
  }
}

const BASE_STATE = {
  id: 'ob-1',
  status: 'not_started',
  current_stage_code: null,
  stages: [],
  answers: undefined,
  skipped_at: null,
  inherited_answer_keys: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  ensureLoaded.mockResolvedValue({ user: { id: 'u-1' } })
  getMine.mockResolvedValue({ user_id: 'u-1', plan: 'growth', is_demo: false })
})

describe('/welcome — atteignable pour un onboarding terminé au sens produit (passage 12, 17/09/2026)', () => {
  it('LE TÉMOIN — un compte qui n’a JAMAIS terminé son onboarding est renvoyé au questionnaire', async () => {
    getState.mockResolvedValue({ ...BASE_STATE, status: 'not_started', skipped_at: null })
    expect(await decide()).toBe('/onboarding')
  })

  it('un compte réellement `completed` reste sur `/welcome`', async () => {
    getState.mockResolvedValue({ ...BASE_STATE, status: 'completed' })
    expect(await decide()).toBeNull()
  })

  it('un compte qui a reporté le questionnaire (« Plus tard ») reste sur `/welcome`', async () => {
    getState.mockResolvedValue({ ...BASE_STATE, status: 'in_progress', skipped_at: '2026-06-01T00:00:00.000Z' })
    expect(await decide()).toBeNull()
  })

  it('l’espace de DÉMONSTRATION reste sur `/welcome`, quel que soit son statut', async () => {
    getState.mockResolvedValue({ ...BASE_STATE, status: 'not_started', skipped_at: null })
    getMine.mockResolvedValue({ user_id: 'demo', plan: 'growth', is_demo: true })
    expect(await decide()).toBeNull()
  })

  it('un état ILLISIBLE (429, panne) ne fait pas disparaître l’écran', async () => {
    getState.mockRejectedValue(new Error('429'))
    expect(await decide()).toBeNull()
  })

  it('un utilisateur non connecté part vers `/login`', async () => {
    ensureLoaded.mockResolvedValue({ user: null })
    expect(await decide()).toBe('/login')
  })
})
