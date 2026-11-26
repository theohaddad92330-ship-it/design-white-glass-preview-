import type { Account } from '@bellum/contracts'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

/** #5107 — « Écosystème », forme maquette V22 : la grille d’abord, l’ancien contenu en « Lecture détaillée ». */

let landscape: Record<string, unknown> = {}
vi.mock('@/lib/api', () => ({ apiFetch: () => Promise.resolve(landscape) }))

// Un identifiant différent par test : `renderWithRouter` partage un QueryClient de niveau module.
let seq = 0
const nextAccount = () => ({ id: `a-grid-${++seq}`, company_name: 'BPCE' }) as Account
const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'Sopra Steria',
  rank: 'unknown',
  relationship: 'unknown',
  note: null,
  source: 'analysis',
  placements: 0,
  certainty: null,
  evidence_origins: ['market_observation'],
  market_observation_count: 3,
  scope: 'Infogérance et applicatif',
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  ...over,
})

beforeEach(() => {
  cleanup()
  landscape = { partners: [], recommendations: [], observed: [] }
})

describe('TabPartners — la grille d’acteurs cités (#5107)', () => {
  it('5107.1 — titre, et phrase avec prénom puis sans prénom', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} firstName="Louis" />)
    expect(await screen.findByRole('heading', { name: 'Des acteurs cités, pas un accès garanti.' })).toBeInTheDocument()
    expect(
      screen.getByText(/^Louis, une observation de collaboration n’établit ni un panel actuel/),
    ).toBeInTheDocument()
  })

  it('5107.1 — sans prénom : phrase sans « prénom, » et avec majuscule', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    expect(
      await screen.findByText(/^Une observation de collaboration n’établit ni un panel actuel/),
    ).toBeInTheDocument()
  })

  it('5107.2 — une carte par société avec preuve : monogramme, nom, périmètre, preuve, pastille, bouton', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    const card = await screen.findByTestId('ecosystem-card-p-1')
    expect(within(card).getByText('SS')).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Sopra Steria' })).toBeInTheDocument()
    expect(within(card).getByText('Infogérance et applicatif')).toBeInTheDocument()
    expect(within(card).getByText(/Historique observé/)).toBeInTheDocument()
    expect(within(card).getByText('Observation du relevé')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /Détail & réserve/ })).toBeInTheDocument()
  })

  it('5107.2 — périmètre absent : « Périmètre non précisé »', async () => {
    landscape = { partners: [partner({ scope: null })], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    const card = await screen.findByTestId('ecosystem-card-p-1')
    expect(within(card).getByText('Périmètre non précisé')).toBeInTheDocument()
  })

  it('5107.3 — « Détail & réserve » ouvre la modale de détail existante', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)
    const card = await screen.findByTestId('ecosystem-card-p-1')
    await user.click(within(card).getByRole('button', { name: /Détail & réserve/ }))
    const dialogue = await screen.findByRole('dialog')
    expect(within(dialogue).getByText('Sopra Steria')).toBeInTheDocument()
  })

  it('5107.4 — une société sans preuve ne fait pas de carte, mais reste dans la lecture détaillée', async () => {
    landscape = {
      partners: [
        partner(),
        partner({ id: 'p-2', name: 'Nordiq', evidence_origins: [], market_observation_count: null }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await screen.findByTestId('ecosystem-card-p-1')
    expect(screen.queryByTestId('ecosystem-card-p-2')).toBeNull()
    const detailed = screen.getByTestId('partners-detailed-reading')
    expect(within(detailed).getByTestId('partner-row-p-2')).toBeInTheDocument()
  })

  it('5107.4 — compte sans écosystème : état vide, aucune carte', async () => {
    renderWithRouter(<TabPartners account={nextAccount()} />)
    expect(
      await screen.findByText('Aucun acteur de services n’est encore relevé autour de ce compte.'),
    ).toBeInTheDocument()
    expect(screen.queryAllByTestId(/^ecosystem-card-/)).toHaveLength(0)
  })

  it('5107.5 — la lecture détaillée est fermée par défaut et garde la liste, le formulaire d’ajout et le bloc d’en-tête', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(
      <TabPartners account={nextAccount()} detailedExtra={<p data-testid="extra-top-blocks">blocs d’en-tête</p>} />,
    )
    const detailed = await screen.findByTestId('partners-detailed-reading')
    expect((detailed as HTMLDetailsElement).open).toBe(false)
    expect(within(detailed).getByTestId('partner-grid')).toBeInTheDocument()
    expect(within(detailed).getByTestId('partner-row-p-1')).toBeInTheDocument()
    expect(within(detailed).getByTestId('extra-top-blocks')).toBeInTheDocument()
    expect(detailed.contains(screen.getByTestId('ecosystem-grid'))).toBe(false)
  })
})
