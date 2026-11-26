import type { Account } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

/**
 * recette 10/09 — « Le score des ESN vaut 10/100 pour TOUTES », mesuré sur
 * BNP Paribas (4 ESN) comme sur ROCHE (6 ESN). `partnerScore`
 * (packages/contracts) EST calculé, correctement : rang inconnu (5) +
 * relation inconnue (5) + 0 placement (0) = 10, LE PLANCHER exact de la
 * formule. `seedDetectedPartners` (accounts.service.ts) écrit CHAQUE ESN
 * détectée par l'analyse avec `rank='unknown'`, `relationship='unknown'`,
 * `placements=0` — un choix documenté et volontaire (« ni le rang ni la
 * relation ne sont devinés ») : toute ESN jamais qualifiée par l'utilisateur
 * calcule donc TOUJOURS exactement 10/100. Un score qui ne varie sur AUCUN
 * des trois facteurs ne mesure rien — il ne doit pas se lire comme un
 * chiffre comparatif.
 */
let landscape: Record<string, unknown> = {}

vi.mock('@/lib/api', () => ({ apiFetch: () => Promise.resolve(landscape) }))

let seq = 0
const nextAccount = () => ({ id: `a-score-${++seq}`, company_name: 'BNP Paribas' }) as Account

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
  certainty: 'moyenne',
  scope: null,
  detected_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  score: 10,
  ...over,
})

beforeEach(() => {
  cleanup()
  landscape = { partners: [], recommendations: [], observed: [] }
})

describe('TabPartners — un score au plancher ne mesure rien (recette 10/09)', () => {
  it('n’affiche pas « 10/100 » pour une ESN détectée jamais qualifiée (rang et relation inconnus)', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByText('Sopra Steria')
    expect(screen.queryByText('10/100')).not.toBeInTheDocument()
  })

  it('quatre ESN toutes détectées ne montrent JAMAIS le même chiffre — car aucune n’en montre', async () => {
    landscape = {
      partners: [
        partner({ id: 'p-1', name: 'Sopra Steria' }),
        partner({ id: 'p-2', name: 'Capgemini' }),
        partner({ id: 'p-3', name: 'Atos' }),
        partner({ id: 'p-4', name: 'Devoteam' }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByText('Devoteam')
    expect(screen.queryAllByText('10/100')).toHaveLength(0)
  })

  it('affiche bien le score dès qu’un des trois facteurs est CONNU — rang déclaré', async () => {
    landscape = { partners: [partner({ rank: 'rank1', score: 50 })], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByText('Sopra Steria')
    expect(screen.getByText('50/100')).toBeInTheDocument()
  })

  it('affiche bien le score dès qu’un placement est connu, même rang/relation inconnus', async () => {
    landscape = { partners: [partner({ placements: 2, score: 26 })], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByText('Sopra Steria')
    expect(screen.getByText('26/100')).toBeInTheDocument()
  })
})
