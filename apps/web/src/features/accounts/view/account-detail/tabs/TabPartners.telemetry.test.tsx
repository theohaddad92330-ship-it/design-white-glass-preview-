import type { Account } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

/**
 * #1624.10 — LA TÉLÉMÉTRIE DES TROIS GESTES DE L'ONGLET.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS TIENNENT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'analytique produit mesure le PRODUIT (cet écran, cette action), jamais la
 * personne ni le compte : aucun identifiant — ni `account.id`, ni le nom de
 * l'ESN cliquée — ne doit jamais atteindre `screen`/`action`. Et le traceur
 * est ÉTEINT par défaut (`VITE_PRODUCT_TRACKER_ENABLED` absente) : cliquer sur
 * ces boutons sans l'interrupteur ne doit produire NI timer NI appel réseau —
 * c'est la garantie « inerte au repos » du module lui-même
 * (`product-tracker.ts`), et ce test la vérifie depuis l'écran qui l'appelle,
 * pas depuis le module.
 *
 * Le troisième geste — « Ce n'est pas exact » — est le TAUX DE CORRECTION que
 * #1624.10 demande : les deux CTA positifs étaient déjà tracés, la correction
 * ne l'était pas. Même garantie « aucun contenu » : le MOTIF de la correction
 * (texte libre tapé par l'utilisateur) ne doit JAMAIS atteindre le traceur,
 * seul le GESTE compte.
 */

const tracker = vi.hoisted(() => ({
  trackActionStarted: vi.fn(),
  trackActionCompleted: vi.fn(),
  trackActionAbandoned: vi.fn(),
}))

vi.mock('@/lib/product-tracker', () => tracker)

let landscape: Record<string, unknown> = {}
// #1624.10 — la mutation « Ce n'est pas exact » et la lecture du paysage
// passent par le MÊME `apiFetch` : distinguer par le `path` permet à un test
// de faire échouer LA MUTATION sans casser la lecture initiale de l'onglet.
const mockFetch = vi.fn((args: { path: string }) =>
  args.path.includes('/dismiss') ? Promise.resolve(landscape) : Promise.resolve(landscape),
)
vi.mock('@/lib/api', () => ({ apiFetch: (args: { path: string }) => mockFetch(args) }))

let seq = 0
const nextAccount = () => ({ id: `a-secret-${++seq}`, company_name: 'SNCF' }) as Account
/**
 * Une ligne qu'AUCUNE déclaration de l'espace ne porte — c'est elle qui porte
 * les deux CTA « Qualifier » / « Vérifier aujourd'hui » (`isObservedOnly`).
 *
 * ⚠️ #1624 (16/09/2026) — la forme est celle que l'API produit VRAIMENT :
 * `mergePartnerEvidence` pousse toujours `current_inference` à côté de
 * `market_observation` sur une ligne `source: 'analysis'`, et
 * `seedDetectedPartners` écrit littéralement `rank`/`relationship` à
 * « unknown ». L'ancienne fixture (`['market_observation']` seule, rang
 * « rank2 ») n'existait nulle part en production : elle gardait vert un
 * prédicat que rien ne pouvait satisfaire.
 */
const observedOnlyPartner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'ALTEN',
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

beforeEach(() => {
  cleanup()
  landscape = { partners: [observedOnlyPartner()], recommendations: [], observed: [] }
  mockFetch.mockClear()
  mockFetch.mockImplementation(() => Promise.resolve(landscape))
  tracker.trackActionStarted.mockClear()
  tracker.trackActionCompleted.mockClear()
  tracker.trackActionAbandoned.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * #1818.1 — les trois gestes ont déménagé dans la modale de détail (la carte
 * garde le nom, le logo et l'état). Un clic sur la carte, avant chacun.
 */
async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
  await screen.findByRole('dialog')
}

describe('TabPartners — télémétrie des CTA « Qualifier » / « Vérifier aujourd’hui » (#1624.10)', () => {
  it('« Qualifier » émet un motif d’écran FIXE — jamais l’id du compte ni le nom de l’ESN', async () => {
    const user = userEvent.setup()
    const account = nextAccount()
    renderWithRouter(<TabPartners account={account} />)
    await openDetail(user)

    const bouton = await screen.findByRole('button', { name: /Qualifier la relation avec ALTEN/ })
    await user.click(bouton)

    expect(tracker.trackActionStarted).toHaveBeenCalledTimes(1)
    const [action, screenName] = tracker.trackActionStarted.mock.calls[0] as [string, string]
    // Le motif est une chaîne FIXE — jamais un chemin réel avec l'id du compte.
    expect(screenName).not.toContain(account.id)
    expect(action).not.toContain('ALTEN')
    expect(action).not.toContain(account.id)
    expect(screenName).toBe('/accounts/$id')
  })

  it('« Qualifier », en succès, complète l’action — sans jamais transporter le nom de l’ESN', async () => {
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(user)

    const bouton = await screen.findByRole('button', { name: /Qualifier la relation avec ALTEN/ })
    await user.click(bouton)

    // #1624 (16/09/2026) — OUVRIR N'EST PAS ÉCRIRE. Le rappel de la modale
    // appelait `POST /accounts/:id/partners`, que l'API refuse par un 400 sur
    // une ligne déjà présente ; il ouvre désormais le formulaire de
    // qualification (`PATCH`), exactement comme le bouton de la carte.
    // L'action se COMPLÈTE donc à l'enregistrement, et c'est le seul endroit
    // où quelque chose a réellement été écrit.
    await user.click(await screen.findByRole('button', { name: /Enregistrer la qualification de ALTEN/i }))

    await vi.waitFor(() => expect(tracker.trackActionCompleted).toHaveBeenCalledTimes(1))
    const [action, screenName] = tracker.trackActionCompleted.mock.calls[0] as [string, string]
    expect(action).not.toContain('ALTEN')
    expect(screenName).toBe('/accounts/$id')
  })

  it('« Vérifier aujourd’hui » émet le MÊME motif d’écran, sans identifiant', async () => {
    const user = userEvent.setup()
    const account = nextAccount()
    renderWithRouter(<TabPartners account={account} />)
    await openDetail(user)

    const lien = await screen.findByRole('link', { name: /Vérifier ALTEN aujourd’hui/ })
    await user.click(lien)

    expect(tracker.trackActionStarted).toHaveBeenCalledTimes(1)
    const [action, screenName] = tracker.trackActionStarted.mock.calls[0] as [string, string]
    expect(screenName).toBe('/accounts/$id')
    expect(action).not.toContain('ALTEN')
    expect(screenName).not.toContain(account.id)
  })
})

/**
 * #1624.10 — LE TAUX DE CORRECTION : « Ce n'est pas exact » SUIT LE MÊME
 * PATRON que les deux CTA positifs, à un geste supplémentaire près (une
 * invite navigateur pour le motif).
 */
describe('TabPartners — télémétrie de la correction « Ce n’est pas exact » (#1624.10)', () => {
  it('émet un motif d’écran FIXE au clic — jamais le nom de l’ESN, jamais le motif tapé', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('doublon avec un autre compte')
    const user = userEvent.setup()
    const account = nextAccount()
    renderWithRouter(<TabPartners account={account} />)
    await openDetail(user)

    const bouton = await screen.findByRole('button', { name: 'Ce n’est pas exact' })
    await user.click(bouton)

    expect(tracker.trackActionStarted).toHaveBeenCalledTimes(1)
    const [action, screenName] = tracker.trackActionStarted.mock.calls[0] as [string, string]
    expect(screenName).toBe('/accounts/$id')
    expect(action).not.toContain('ALTEN')
    expect(action).not.toContain(account.id)
    expect(action).not.toContain('doublon avec un autre compte')
    expect(screenName).not.toContain(account.id)
  })

  it('en succès, complète l’action', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('doublon avec un autre compte')
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(user)

    const bouton = await screen.findByRole('button', { name: 'Ce n’est pas exact' })
    await user.click(bouton)

    await vi.waitFor(() => expect(tracker.trackActionCompleted).toHaveBeenCalledTimes(1))
    const [action, screenName] = tracker.trackActionCompleted.mock.calls[0] as [string, string]
    expect(action).not.toContain('ALTEN')
    expect(screenName).toBe('/accounts/$id')
  })

  it('en échec réseau, abandonne l’action — sans démarrer ni compléter', async () => {
    mockFetch.mockImplementation((args: { path: string }) =>
      args.path.includes('/dismiss') ? Promise.reject(new Error('boom')) : Promise.resolve(landscape),
    )
    vi.spyOn(window, 'prompt').mockReturnValue('doublon avec un autre compte')
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(user)

    const bouton = await screen.findByRole('button', { name: 'Ce n’est pas exact' })
    await user.click(bouton)

    await vi.waitFor(() => expect(tracker.trackActionAbandoned).toHaveBeenCalledTimes(1))
    const [action, screenName, atStep] = tracker.trackActionAbandoned.mock.calls[0] as [string, string, string]
    expect(action).not.toContain('ALTEN')
    expect(screenName).toBe('/accounts/$id')
    expect(atStep).toBe('error')
    expect(tracker.trackActionCompleted).not.toHaveBeenCalled()
  })

  it('sans motif saisi (invite annulée), n’émet AUCUN événement — rien ne s’est produit', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(user)

    const bouton = await screen.findByRole('button', { name: 'Ce n’est pas exact' })
    await user.click(bouton)

    expect(tracker.trackActionStarted).not.toHaveBeenCalled()
  })
})
