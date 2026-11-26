import type { Account } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

// #5107.5 — la grille de cartes (EcosystemGrid) a sa suite, `TabPartners.grid.test.tsx` ; ici on lit la lecture détaillée,
// qui garde la liste d'avant telle quelle (sans la grille, un nom ou une origine ne se lirait pas deux fois dans le DOM).
vi.mock('./ecosystem/EcosystemGrid', () => ({ EcosystemGrid: () => null }))

let landscape: Record<string, unknown> = {}

vi.mock('@/lib/api', () => ({ apiFetch: () => Promise.resolve(landscape) }))

// ⚠️ Un identifiant DIFFÉRENT par test — `renderWithRouter` partage un
// `QueryClient` de niveau module, voir `TabPartners.evidence.test.tsx`.
let seq = 0
const nextAccount = () => ({ id: `a-decl-${++seq}`, company_name: 'SNCF' }) as Account
const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'Nordiq',
  rank: 'rank2',
  relationship: 'partner',
  note: null,
  source: 'declared',
  placements: 0,
  certainty: null,
  scope: null,
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  ...over,
})

beforeEach(() => {
  cleanup()
  landscape = { partners: [], recommendations: [], observed: [] }
})

/**
 * #1624.7 — LE RANG « DÉCLARÉ » DU RÉFÉRENTIEL ESN, SUR L'ONGLET PARTENAIRES.
 *
 * `EvidenceOrigins` (TabPartners.tsx:47-69) sépare déjà Déclaré / Source
 * actuelle / Observation — ces tests prouvent que le rang déclaré du
 * référentiel ESN se range DANS cette même structure, sans en créer une
 * seconde : c'est le SERVEUR qui décide d'ajouter `declared_subcontracting`
 * à `evidence_origins` (voir `partners.service.spec.ts`), l'écran se contente
 * de le traduire comme les trois autres origines.
 */
describe('TabPartners — le rang déclaré du référentiel ESN (#1624.7)', () => {
  it('affiche « Rang 2 déclaré » quand le serveur porte cette origine', async () => {
    landscape = {
      partners: [partner({ evidence_origins: ['declared_subcontracting'] })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    expect(await screen.findByText('Rang 2 déclaré')).toBeInTheDocument()
  })

  it('coexiste avec les autres origines, sur la MÊME ligne', async () => {
    landscape = {
      partners: [
        partner({
          evidence_origins: ['workspace_declared', 'declared_subcontracting'],
        }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    expect(await screen.findByText('Déclarée par ton équipe')).toBeInTheDocument()
    expect(screen.getByText('Rang 2 déclaré')).toBeInTheDocument()
    expect(screen.getAllByText('Nordiq')).toHaveLength(1)
  })

  it('ne s’affiche PAS quand le référentiel n’a rien déclaré', async () => {
    landscape = {
      partners: [partner({ evidence_origins: ['workspace_declared'] })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    expect(await screen.findByText('Déclarée par ton équipe')).toBeInTheDocument()
    expect(screen.queryByText('Rang 2 déclaré')).not.toBeInTheDocument()
  })
})
