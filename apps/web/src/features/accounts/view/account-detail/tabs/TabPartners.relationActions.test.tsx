import type { Account } from '@bellum/contracts'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { chooseOption, getSelect } from '@/test/select'
import { TabPartners } from './TabPartners'

let landscape: Record<string, unknown> = {}
let calls: { path: string; method?: string; body?: unknown }[] = []

vi.mock('@/lib/api', () => ({
  apiFetch: (args: { path: string; method?: string; body?: unknown }) => {
    calls.push(args)
    if (args.method) return Promise.resolve({})
    return Promise.resolve(landscape)
  },
}))

// #3404.5 — le mock générique de `apiFetch` ci-dessus route sur la MÉTHODE,
// pas le chemin : sans ce mock dédié, la requête des relations gouvernées
// recevrait `landscape` (un objet, pas un tableau) et `partnerRelations.map`
// romprait tous les tests de ce fichier, qui ne parlent pas de gouvernance.
vi.mock('@/features/partner-pipeline/api/partner-pipeline-api', () => ({
  PARTNER_PIPELINE_KEY: ['partners', 'pipeline'],
  fetchPartnerRelations: () => Promise.resolve([]),
}))

// ⚠️ Un identifiant DIFFÉRENT par test — `renderWithRouter` partage un
// `QueryClient` de niveau module (voir `TabPartners.evidence.test.tsx`).
let seq = 0
const nextAccount = () => ({ id: `a-actions-${++seq}`, company_name: 'SNCF' }) as Account

const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'ALTEN',
  rank: 'unknown',
  relationship: 'unknown',
  note: null,
  source: 'analysis',
  placements: 0,
  certainty: 'moyenne',
  scope: null,
  detected_at: '2026-08-19T00:00:00.000Z',
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  // Ce que le serveur rend VRAIMENT : `mergePartnerEvidence` pousse toujours
  // `workspace_declared` (source `declared`) ou `current_inference` (source
  // `analysis`). Une ligne canonique n'est JAMAIS observée seule — c'est ce
  // qui rendait les deux CTA de la modale inatteignables.
  evidence_origins: ['market_observation', 'current_inference'],
  market_observation_count: 9,
  ...over,
})

beforeEach(() => {
  cleanup()
  calls = []
  landscape = { partners: [], recommendations: [], observed: [] }
})

/**
 * #2122.46 / #2122.59 / #2122.63 — CHAQUE RELATION AFFICHÉE PORTE UNE ACTION.
 *
 * La sous-section « Sociétés de services reliées » n'en portait aucune : #1818
 * avait déménagé les trois CTA dans la modale, et ils y étaient rendus derrière
 * `isObservedOnly` — un prédicat que la liste canonique ne peut pas satisfaire.
 * Résultat mesuré : une carte de relation sans un seul geste possible.
 */
describe('TabPartners — une action par relation (#2122.46 / .59 / .63)', () => {
  it('#2122.63 — la carte d’une relation porte un bouton « Qualifier »', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    expect(within(ligne).getByRole('button', { name: /Qualifier ALTEN/i })).toBeInTheDocument()
  })

  it('#2122.59 — type, preuve, confiance ET action, sans clic supplémentaire', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    // le type (rang + relation), la preuve (origines), la confiance
    // #1624 (16/09/2026) — le TYPE d'une ligne seulement observée se nomme
    // « Route partenaire potentielle » au lieu de « Rang inconnu » : le rang
    // n'est pas manquant, il n'a simplement pas encore été qualifié, et
    // l'observation dit ce qu'elle ouvre.
    expect(within(ligne).getByText(/Route partenaire potentielle|Potential partner route/i)).toBeInTheDocument()
    // #4295.18 — « certitude moyenne » devient « indices probables » : le niveau reste lisible sans clic, sans promettre de certitude.
    // #3667 revient sur le libellé « Observation <marque> », délibérément ; ce qui tient : la preuve de la relation reste nommée sur la ligne.
    expect(within(ligne).getAllByText(/^Historique observé/).length).toBeGreaterThan(0)
    expect(within(ligne).getByText(/indices probables|probable evidence/i)).toBeInTheDocument()
    // …et l'action, sur la MÊME carte
    expect(within(ligne).getAllByRole('button').length).toBeGreaterThan(1)
  })

  it('#2122.46 — « Qualifier » ouvre le choix du rang et de la relation, et ÉCRIT', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    await user.click(within(ligne).getByRole('button', { name: /Qualifier ALTEN/i }))

    await chooseOption(getSelect(/Rang de ALTEN/i), 'rank1')
    await chooseOption(getSelect(/ALTEN est pour nous/i), 'competitor')
    await user.click(screen.getByRole('button', { name: /Enregistrer la qualification de ALTEN/i }))

    const patch = calls.find(call => call.method === 'PATCH')
    expect(patch?.path).toBe('/accounts/partners/p-1')
    expect(patch?.body).toEqual({ rank: 'rank1', relationship: 'competitor' })
  })

  // #2316.34 — LE FAIT TERRAIN, dans le MÊME formulaire que le rang et la
  // relation (GA-26 : un réglage vit à un seul endroit, un second formulaire
  // dédié serait le doublon que la loi 4 du tome 7 refuse).
  it('#2316.34 — le formulaire de qualification écrit aussi l’information terrain', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    await user.click(within(ligne).getByRole('button', { name: /Qualifier ALTEN/i }))

    await user.type(screen.getByLabelText(/information terrain/i), 'TMA reprise en interne au 01/09')
    await user.click(screen.getByRole('button', { name: /Enregistrer la qualification de ALTEN/i }))

    const patch = calls.find(call => call.method === 'PATCH')
    expect(patch?.body).toEqual({
      rank: 'unknown',
      relationship: 'unknown',
      note: 'TMA reprise en interne au 01/09',
    })
  })

  // #3205.4 (épopée #3239) — risque concurrentiel et complémentarité, DANS
  // CE MÊME formulaire générique (doctrine c75), même geste que la note.
  it('#3205.4 — le formulaire de qualification écrit aussi le risque concurrentiel', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    await user.click(within(ligne).getByRole('button', { name: /Qualifier ALTEN/i }))

    await user.type(screen.getByLabelText(/risque concurrentiel de ALTEN/i), 'Concurrent direct sur la DSI')
    await user.click(screen.getByRole('button', { name: /Enregistrer la qualification de ALTEN/i }))

    const patch = calls.find(call => call.method === 'PATCH')
    expect(patch?.body).toEqual({
      rank: 'unknown',
      relationship: 'unknown',
      competitive_risk: 'Concurrent direct sur la DSI',
    })
  })

  // #2316.22-.27 — LES CINQ CRITÈRES DE QUALIFICATION RANG 2, dans ce MÊME
  // formulaire (pas un treizième dédié) — apparaissent au choix du rang rang2.
  it('#2316.22-.27 — choisir « rang2 » fait apparaître les cinq critères, envoyés à l’enregistrement', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    await user.click(within(ligne).getByRole('button', { name: /Qualifier ALTEN/i }))
    await chooseOption(getSelect(/Rang de ALTEN/i), 'rank2')

    await chooseOption(getSelect(/Compte ou périmètre accessible pour ALTEN/i), 'yes')
    await chooseOption(getSelect(/Brief précis pour ALTEN/i), 'no')
    // Les trois autres critères restent « non mesuré » — jamais devinés.

    await user.click(screen.getByRole('button', { name: /Enregistrer la qualification de ALTEN/i }))

    const patch = calls.find(call => call.method === 'PATCH')
    expect(patch?.body).toEqual({
      rank: 'rank2',
      relationship: 'unknown',
      rank2_scope_accessible: true,
      rank2_brief_precise: false,
      rank2_contact_accountable: null,
      rank2_economics_clear: null,
      rank2_next_steps_ready: null,
    })
  })

  it('#2316.22-.27 — rester sur un rang non-rang2 n’envoie AUCUN des cinq critères', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    await user.click(within(ligne).getByRole('button', { name: /Qualifier ALTEN/i }))
    await chooseOption(getSelect(/Rang de ALTEN/i), 'rank1')
    await user.click(screen.getByRole('button', { name: /Enregistrer la qualification de ALTEN/i }))

    const patch = calls.find(call => call.method === 'PATCH')
    expect(patch?.body).toEqual({ rank: 'rank1', relationship: 'unknown' })
  })

  it('#2316.34 — ne pas toucher au champ ne renvoie AUCUNE note (elle reste intacte)', async () => {
    landscape = { partners: [partner({ note: 'Note déjà là' })], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    await user.click(within(ligne).getByRole('button', { name: /Qualifier ALTEN/i }))
    await chooseOption(getSelect(/Rang de ALTEN/i), 'rank1')
    await user.click(screen.getByRole('button', { name: /Enregistrer la qualification de ALTEN/i }))

    const patch = calls.find(call => call.method === 'PATCH')
    expect(patch?.body).toEqual({ rank: 'rank1', relationship: 'unknown' })
  })

  it('#2122.46 — une ligne DÉCLARÉE par l’espace porte l’action elle aussi', async () => {
    landscape = {
      partners: [partner({ source: 'declared', evidence_origins: ['workspace_declared'], rank: 'rank2' })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    expect(within(ligne).getByRole('button', { name: /Qualifier ALTEN/i })).toBeInTheDocument()
  })

  it('le bouton d’ouverture de la modale n’imbrique aucun bouton (GA-35)', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ouvrir = await screen.findByRole('button', { name: /Voir le détail de ALTEN/i })
    expect(ouvrir.querySelector('button')).toBeNull()
    expect(ouvrir.querySelector('a')).toBeNull()
  })
})
