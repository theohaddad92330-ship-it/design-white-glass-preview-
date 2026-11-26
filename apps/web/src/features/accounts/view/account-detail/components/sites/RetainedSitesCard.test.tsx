import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Site, SiteFit } from '@bellum/contracts'
import { RetainedSitesCard } from './RetainedSitesCard'

/**
 * #2284.56 — la relation `site_of` (quel site appartient à quelle entité) se
 * VOIT enfin sur un écran : `sites.entity_id` existait depuis le 24/08/2026
 * mais son seul point d'entrée API (`GET/POST :id/site-list`) n'avait aucun
 * appelant côté web.
 */

const FIT: SiteFit = { verdict: 'unknown', reason: "aucune politique de site n'est déclarée" }

function makeSite(overrides: Partial<Site> = {}): Site & { fit: SiteFit } {
  return {
    id: 'site-1',
    account_id: 'account-1',
    entity_id: null,
    label: 'EDF Saclay',
    city: 'Saclay',
    postal_code: null,
    country: 'FR',
    siret: null,
    headcount: null,
    site_type: null,
    activity_sector_codes: [],
    industrial_function_codes: [],
    headcount_confidence: null,
    headcount_source: null,
    headcount_observed_at: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    fit: FIT,
    ...overrides,
  }
}

describe('RetainedSitesCard', () => {
  it('muette sans aucun site retenu', () => {
    const { container } = render(<RetainedSitesCard sites={[]} entityNameById={new Map()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme le site et sa ville', () => {
    render(<RetainedSitesCard sites={[makeSite()]} entityNameById={new Map()} />)
    expect(screen.getByText('EDF Saclay')).toBeInTheDocument()
    expect(screen.getByText(/·\s*Saclay/)).toBeInTheDocument()
  })

  it('nomme la relation site_of quand le site est rattaché à une entité', () => {
    const site = makeSite({ entity_id: 'entity-1' })
    render(<RetainedSitesCard sites={[site]} entityNameById={new Map([['entity-1', 'EDF Renouvelables']])} />)
    expect(screen.getByText(/EDF Renouvelables/)).toBeInTheDocument()
  })

  it('n’affiche AUCUNE ligne de relation quand le site n’est rattaché à aucune entité (on n’affiche pas ce qu’on n’a pas)', () => {
    render(<RetainedSitesCard sites={[makeSite({ entity_id: null })]} entityNameById={new Map()} />)
    expect(screen.queryByText(/Rattaché/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Linked to/)).not.toBeInTheDocument()
  })
})
