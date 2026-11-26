import { cleanup, render, screen } from '@testing-library/react'
import type { TargetListItem } from '@bellum/contracts'
import { afterEach, describe, expect, it } from 'vitest'

const { SellerTargeting, TARGET_SELECT_CELL_CLASS, TARGET_ITEM_CELL_CLASS } = await import('./TargetListCard')

const STAMP = '2026-09-01T00:00:00.000Z'

const ITEM: TargetListItem = {
  id: 'i1',
  target_list_id: 'list-1',
  kind: 'account',
  ref_id: 'acc-1',
  label: 'Banque Alpha',
  sublabel: null,
  selection_reason: null,
  priority: null,
  owner_user_id: null,
  work_status: 'to_review',
  provenance: 'import',
  refreshed_at: null,
  removed_at: null,
  removal_reason: null,
  next_action: null,
  notes: null,
  created_at: STAMP,
  updated_at: STAMP,
}

/**
 * #3753.2/.3/.6 — le ciblage de l'ESN s'affiche comme venant d'ELLE, le tier est
 * une LETTRE (jamais un pourcentage), et une absence ne fait aucune ligne.
 */
describe('SellerTargeting — #3753', () => {
  afterEach(cleanup)

  it('montre « Tier A », la raison, et les hypothèses « selon ton ciblage »', () => {
    render(
      <SellerTargeting
        item={{
          ...ITEM,
          tier_label: 'A',
          priority: 'high',
          selection_reason: 'Plan de transformation SI',
          seller_hypotheses: { addressable_issues: 'Dette applicative', upcoming_it_projects: 'Migration ERP' },
        }}
      />,
    )
    expect(screen.getByText('Tier A')).toBeTruthy()
    expect(screen.getByText(/Plan de transformation SI/)).toBeTruthy()
    expect(screen.getByText(/Dette applicative/)).toBeTruthy()
    expect(screen.getByText(/selon ton ciblage[^]*Migration ERP|Migration ERP/)).toBeTruthy()
    expect(screen.getAllByText(/selon ton ciblage/i).length).toBeGreaterThanOrEqual(2)
  })

  it('n’affiche jamais le tier comme un pourcentage ni une chance', () => {
    const { container } = render(<SellerTargeting item={{ ...ITEM, tier_label: 'B', priority: 'medium' }} />)
    expect(container.textContent).toBe('Tier B')
    expect(container.textContent).not.toMatch(/%|chance|probab/i)
  })

  it('sans tier, sans raison et sans hypothèse : AUCUNE ligne', () => {
    const { container } = render(
      <SellerTargeting item={{ ...ITEM, tier_label: null, seller_hypotheses: null, selection_reason: null }} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('un champ absent ne fait pas sa ligne', () => {
    render(<SellerTargeting item={{ ...ITEM, seller_hypotheses: { addressable_issues: 'SI vieillissant' } }} />)
    expect(screen.getByText(/SI vieillissant/)).toBeTruthy()
    expect(screen.queryByText(/Projets IT/)).toBeNull()
    expect(screen.queryByText(/^Tier/)).toBeNull()
  })
})

/** Recette 06/10 — le bloc tier/raison ne doit plus écraser statut et responsable (« À… », « Maëlle… »). */
describe('colonnes du tableau de cibles — non-troncature', () => {
  it('statut et responsable ont une largeur plancher en rem ; la 1re colonne est bornée', () => {
    expect(TARGET_SELECT_CELL_CLASS.status).toMatch(/min-w-(40|44|48)/)
    expect(TARGET_SELECT_CELL_CLASS.owner).toMatch(/min-w-(44|48)/)
    expect(TARGET_ITEM_CELL_CLASS).toMatch(/max-w-/)
    expect(Object.values(TARGET_SELECT_CELL_CLASS).join(' ')).not.toMatch(/\[\d+px\]/)
  })
})
