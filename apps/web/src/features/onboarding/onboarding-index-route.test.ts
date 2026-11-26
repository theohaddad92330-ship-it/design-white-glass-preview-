import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEMPS1_REQUIRED_KEYS, type EsnAnswers } from '@bellum/contracts'
import { TEMPS1_QUESTION_KEYS } from '@/features/onboarding/lib/questions'

/**
 * 16/09/2026 — L'APPELANT de `canOfferResume`, et le seul endroit où le défaut
 * mesuré se voyait.
 *
 * `GET /api/onboarding/state` rendait, sur l'espace de Louis, `status:
 * completed` avec `current_stage_code: transition_summary` et plus de soixante
 * réponses à `null`. Ce garde-ci ne lisait que `needsOnboarding`, qui ne lit que
 * le STATUT : `/onboarding` renvoyait donc chez Laura, et le parcours ne se
 * reprenait plus jamais. Un prédicat juste dans `onboarding-gate.ts` que
 * personne n'appelle ne corrigerait rien — c'est le motif le plus fréquent de ce
 * dépôt, alors l'appelant est gardé ICI.
 *
 * Le fichier vit hors de `src/routes/` à dessein : le générateur de routes
 * TanStack scanne ce dossier et transformerait un `*.test.ts` en route.
 */
const { getState, getMine, ensureLoaded } = vi.hoisted(() => ({
  getState: vi.fn(),
  getMine: vi.fn(),
  ensureLoaded: vi.fn(),
}))

vi.mock('@/features/auth/session-manager', () => ({ sessionManager: { ensureLoaded } }))
vi.mock('@/features/credits/api', () => ({ creditsApi: { getMine } }))
vi.mock('@/features/onboarding/api', () => ({ onboardingApi: { getState } }))
vi.mock('@/features/preferences/preferences-provider', () => ({ landingRouteNow: () => '/chat' }))
// L'écran n'est pas rendu ici : ce test interroge la DÉCISION du garde.
vi.mock('@/features/onboarding/view/OnboardingWelcomePage', () => ({ OnboardingWelcomePage: () => null }))

const LIST_KEYS: readonly string[] = ['expertise_areas', 'target_sectors', 'target_company_types', 'geo_zones']

function answers(keys: readonly string[]): EsnAnswers {
  const blank = Object.fromEntries(TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? [] : null]))
  const filled = Object.fromEntries(keys.map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']))
  // `EsnAnswers` porte désormais une valeur STRUCTURÉE (`esn_objectives`),
  // qu'une fixture de Temps 1 ne construit pas : la conversion directe ne se
  // recouvre plus. Ce test n'interroge que la décision du garde de route.
  return { ...blank, ...filled } as unknown as EsnAnswers
}

/**
 * L'espace mesuré : marqué terminé au récapitulatif, étape 5 sur 8.
 *
 * #2626.1 revient sur cette fixture, délibérément — depuis l'arbitrage Temps 2
 * du 20/09/2026, `TEMPS1_QUESTION_KEYS` s'est réduit à `TEMPS1_REQUIRED_KEYS` :
 * les remplir TOUTES ne distingue plus « récap seul » de « a tout parcouru ».
 * Le mécanisme de l'incident du 16/09 qui SURVIT à #2626.1 (GA-26 — une clé
 * requise ne s'ajoute au Temps 1 que d'un geste, l'inscrire dans
 * `TEMPS1_REQUIRED_KEYS`) est une clé requise absente sur un compte déjà
 * `completed` : c'est ce que cette fixture simule maintenant.
 */
const ARRETE_AU_RECAP = {
  id: 'ob-1',
  status: 'completed',
  current_stage_code: 'transition_summary',
  stages: [],
  answers: answers(TEMPS1_REQUIRED_KEYS.slice(0, -1)),
  skipped_at: null,
  inherited_answer_keys: [],
}

/** Le témoin : un espace terminé qui a réellement parcouru toutes ses étapes. */
const TOUT_PARCOURU = { ...ARRETE_AU_RECAP, answers: answers(TEMPS1_QUESTION_KEYS) }

/**
 * Joue `beforeLoad` et rend la DESTINATION de la redirection lancée, ou `null`
 * quand le garde laisse l'écran s'afficher. `redirect()` de TanStack Router rend
 * une `Response` qui porte sa cible dans `options.to` — lire `thrown.to`
 * rendrait `undefined` pour toute redirection, donc un test toujours vert.
 */
async function decide(): Promise<string | null> {
  const { Route } = await import('@/routes/onboarding/index')
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

beforeEach(() => {
  vi.clearAllMocks()
  ensureLoaded.mockResolvedValue({ user: { id: 'u-1' } })
  getMine.mockResolvedValue({ user_id: 'u-1', plan: 'growth', is_demo: false })
})

describe('/onboarding — la voie de reprise d’un parcours marqué terminé trop tôt (16/09/2026)', () => {
  it('l’espace mesuré n’est plus renvoyé chez Laura : il voit la page qui PROPOSE', async () => {
    getState.mockResolvedValue(ARRETE_AU_RECAP)
    expect(await decide()).toBeNull()
  })

  it('LE TÉMOIN — un espace qui a tout parcouru reste renvoyé hors du questionnaire', async () => {
    getState.mockResolvedValue(TOUT_PARCOURU)
    expect(await decide()).toBe('/chat')
  })

  it('l’espace de DÉMONSTRATION est partagé : il sort, même avec des étapes jamais posées', async () => {
    getState.mockResolvedValue(ARRETE_AU_RECAP)
    getMine.mockResolvedValue({ user_id: 'demo', plan: 'growth', is_demo: true })
    expect(await decide()).toBe('/chat')
  })

  it('un état ILLISIBLE ne fabrique pas une reprise — on ne conclut rien sur une panne', async () => {
    getState.mockRejectedValue(new Error('429'))
    expect(await decide()).toBe('/chat')
  })
})

/**
 * #2021 — DÉCISION LOUIS 08/10/2026 : le bandeau de reprise (`CustomerPageContent`)
 * envoie un utilisateur déjà onboardé vers `/onboarding` via « Reprendre ». Ce
 * garde-ci NE DOIT PAS le renvoyer ailleurs juste après — c'est exactement
 * pour ça que son appel à `needsOnboarding` (ligne ~51) omet délibérément
 * `firstCompletedAt` : le passer ferait rendre `false`, donc rebondir vers
 * `landingRouteNow()`, et le bandeau n'ouvrirait jamais rien. Témoin de
 * non-régression : si quelqu'un « corrige » cet appel en lui ajoutant le
 * nouveau champ, cette suite rougit.
 */
const REFRESH_REQUIRED_DEJA_ONBOARDE = {
  id: 'ob-2',
  status: 'refresh_required',
  current_stage_code: 'company_info',
  stages: [],
  answers: answers(TEMPS1_QUESTION_KEYS),
  skipped_at: null,
  first_completed_at: '2026-08-01T00:00:00.000Z',
  inherited_answer_keys: [],
}

describe('/onboarding — « Reprendre » depuis le bandeau de reprise (#2021) n’est jamais rebondi', () => {
  it('un utilisateur déjà onboardé à `refresh_required` voit bien la page de reconfiguration, pas un rebond', async () => {
    getState.mockResolvedValue(REFRESH_REQUIRED_DEJA_ONBOARDE)
    expect(await decide()).toBeNull()
  })
})
