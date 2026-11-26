import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LostDealRex } from '@bellum/contracts'

/**
 * #3295 (reste) — Section « Pertes documentées » de la fiche opportunité,
 * dans l'esprit de `/pilotage/rex` mais pour les pertes. `useLostDealRexForProject`
 * est MOQUÉ : ce fichier garde le rendu, pas la lecture réseau.
 */

const query = vi.fn()
vi.mock('../hooks/useLostDealRexForProject', () => ({
  useLostDealRexForProject: () => query(),
}))

const { LostDealRexPanel } = await import('./LostDealRexPanel')

function rex(over: Partial<LostDealRex> = {}): LostDealRex {
  return {
    id: 'rex-1',
    workspace_id: 'ws-1',
    created_by: 'user-1',
    created_at: '2026-09-20T09:00:00.000Z',
    project_id: 'p-1',
    account_id: null,
    perimeter: null,
    need: null,
    people_involved: null,
    real_decider: null,
    sponsor: 'Le DSI',
    route_used: 'Entrée directe par le sponsor métier',
    proof_used: null,
    angle_tried: null,
    angles_not_tried: [],
    last_action: { value: 'Proposition envoyée le 12/09', distinction: 'interpretation_commerciale' },
    declared_motif: 'budget',
    declared_motif_note: null,
    suspected_motif: null,
    suspected_motif_note: null,
    competitor: null,
    timing: null,
    cycle_days: null,
    procurement_friction: null,
    consultant_gap: null,
    economics: null,
    what_team_knows_now: null,
    revisit_on: null,
    reuse_targets: [],
    ...over,
  }
}

beforeEach(() => query.mockReset())

describe('LostDealRexPanel', () => {
  it('liste un REX recueilli avec son motif et son sponsor', () => {
    query.mockReturnValue({ items: [rex()], isLoading: false, isError: false })
    render(<LostDealRexPanel projectId="p-1" />)

    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Le DSI')).toBeInTheDocument()
    expect(screen.getByText('Entrée directe par le sponsor métier')).toBeInTheDocument()
    expect(screen.getByText('Proposition envoyée le 12/09 (Interprétation commerciale)')).toBeInTheDocument()
  })

  it("n'affiche AUCUNE ligne pour un champ non renseigné — pas de valeur devinée", () => {
    query.mockReturnValue({ items: [rex({ sponsor: null })], isLoading: false, isError: false })
    render(<LostDealRexPanel projectId="p-1" />)
    expect(screen.queryByText('Sponsor')).not.toBeInTheDocument()
  })

  it('sans aucun REX recueilli, dit que rien n’a encore été documenté', () => {
    query.mockReturnValue({ items: [], isLoading: false, isError: false })
    render(<LostDealRexPanel projectId="p-1" />)
    expect(screen.getByText('Aucune perte documentée sur cette affaire pour l’instant.')).toBeInTheDocument()
  })

  it('une lecture en échec le dit, sans inventer un vide', () => {
    query.mockReturnValue({ items: [], isLoading: false, isError: true })
    render(<LostDealRexPanel projectId="p-1" />)
    expect(screen.getByText('Les REX de perte n’ont pas pu être chargés.')).toBeInTheDocument()
  })
})
