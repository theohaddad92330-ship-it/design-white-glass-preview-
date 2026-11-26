import type { Account } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { initProductTracker, resetProductTrackerForTests } from '@/lib/product-tracker'
import { TabPartners } from './TabPartners'

/**
 * #1624.10 — LE TRACEUR RÉEL RESTE INERTE QUAND L'INTERRUPTEUR EST ÉTEINT.
 *
 * ⚠️ Fichier SÉPARÉ de `TabPartners.telemetry.test.tsx` : celui-ci ne mocke
 * PAS `@/lib/product-tracker`, donc c'est la VRAIE implémentation qui tourne
 * ici — celle qui décide NO-OP STRICT (aucun timer, aucun appel réseau).
 *
 * ⚠️ Le traceur TAMPONNE (`FLUSH_INTERVAL_MS = 15s`) : cliquer puis regarder
 * `fetch` tout de suite ne prouverait RIEN, activé ou non — rien ne part
 * avant le prochain flush de toute façon. `onPageHide` VIDE le tampon
 * immédiatement ; c'est donc lui qu'on déclenche pour forcer la preuve, comme
 * `initProductTracker()` (appelé une fois par `main.tsx` au démarrage) est ce
 * qui attache ce déclencheur. Sans lui — l'état par défaut de ce composant,
 * qui n'appelle jamais `initProductTracker` lui-même — rien n'est de toute
 * façon câblé.
 *
 * Le test « sait dire NON » : la seconde `describe`, avec le traceur ARMÉ,
 * PROUVE que le même geste (clic puis `pagehide`) DÉCLENCHE bien un envoi —
 * sinon un défaut qui ferait toujours passer ce test resterait invisible.
 */

let landscape: Record<string, unknown> = {}
vi.mock('@/lib/api', () => ({ apiFetch: () => Promise.resolve(landscape) }))

let seq = 0
const nextAccount = () => ({ id: `a-inert-${++seq}`, company_name: 'SNCF' }) as Account
const observedOnlyPartner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'ALTEN',
  // #1624 (16/09/2026) — la forme RÉELLE : le pipeline écrit littéralement
  // « unknown » sur les DEUX champs, et une valeur qualifiée retirerait la
  // ligne de « seulement observée » (une personne l'aurait tranchée).
  rank: 'unknown',
  relationship: 'unknown',
  note: null,
  source: 'analysis',
  placements: 0,
  certainty: null,
  scope: null,
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  evidence_origins: ['market_observation', 'current_inference'],
  market_observation_count: 9,
  ...over,
})

/**
 * #1818.1 — « Qualifier » vit désormais dans la modale de détail (la carte
 * garde le nom, le logo et l'état) : ouvrir la carte d'abord.
 */
async function fireQualifyClick(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
  await screen.findByRole('dialog')
  return screen.findByRole('button', { name: /Qualifier la relation avec ALTEN/ })
}

function analyticsFetchCalls(fetchSpy: { mock: { calls: unknown[][] } }): unknown[] {
  return fetchSpy.mock.calls.filter(call => String(call[0]).includes('/analytics/events'))
}

beforeEach(() => {
  cleanup()
  resetProductTrackerForTests()
  landscape = { partners: [observedOnlyPartner()], recommendations: [], observed: [] }
})

afterEach(() => {
  resetProductTrackerForTests()
  vi.unstubAllEnvs()
})

describe('TabPartners — le VRAI traceur reste inerte quand VITE_PRODUCT_TRACKER_ENABLED est absente', () => {
  it('cliquer sur « Qualifier » puis fermer l’onglet ne déclenche AUCUN appel réseau', async () => {
    vi.stubEnv('VITE_PRODUCT_TRACKER_ENABLED', '')
    initProductTracker() // no-op strict : l'interrupteur est éteint
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await fireQualifyClick(user))
    window.dispatchEvent(new Event('pagehide'))

    expect(analyticsFetchCalls(fetchSpy)).toHaveLength(0)
    fetchSpy.mockRestore()
  })
})

/**
 * Le témoin : le MÊME geste, traceur ARMÉ, doit produire un envoi. Sans ce
 * test, le test ci-dessus pourrait rester vert pour une mauvaise raison (un
 * défaut qui empêcherait TOUT envoi, interrupteur ou pas).
 */
describe('TabPartners — témoin : le traceur ARMÉ envoie bien quelque chose', () => {
  it('cliquer sur « Qualifier » puis fermer l’onglet déclenche un envoi', async () => {
    vi.stubEnv('VITE_PRODUCT_TRACKER_ENABLED', 'true')
    initProductTracker()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await fireQualifyClick(user))
    window.dispatchEvent(new Event('pagehide'))

    expect(analyticsFetchCalls(fetchSpy).length).toBeGreaterThan(0)
    fetchSpy.mockRestore()
  })
})
