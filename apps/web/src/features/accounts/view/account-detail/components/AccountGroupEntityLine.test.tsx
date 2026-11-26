import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountGroupEntityLine, groupEntityOf } from './AccountGroupEntityLine'

const resolution = (over: Record<string, unknown> = {}) => ({
  entity_resolution: {
    state: 'resolved',
    kind: 'subsidiary',
    canonical_id: 'siren:123456789',
    commercial_name: 'Orange Business',
    legal_name: null,
    country: 'FR',
    identifiers: { siren: '123456789' },
    domain: null,
    naf_code: null,
    naf_label: null,
    location: null,
    parent_names: ['Orange'],
    children_count: null,
    sources: ['legal_identifier'],
    confidence: 90,
    reasons: [],
    question: null,
    resolved_at: '2026-10-01T00:00:00.000Z',
    ...over,
  },
})

// #4988.1 — « Groupe X · entité analysée Y » quand le compte est une entité d'un groupe connu ; rien sinon.
describe('groupEntityOf — #4988.1', () => {
  it('une filiale avec un groupe parent connu : groupe + entité', () => {
    expect(groupEntityOf(resolution())).toEqual({ group: 'Orange', entity: 'Orange Business' })
  })
  it('le compte EST le groupe : rien', () => {
    expect(groupEntityOf(resolution({ kind: 'group', parent_names: [] }))).toBeNull()
  })
  it('entité sans groupe parent connu : rien (on n’invente pas de groupe)', () => {
    expect(groupEntityOf(resolution({ parent_names: [] }))).toBeNull()
  })
  it('pas de résolution du tout : rien', () => {
    expect(groupEntityOf({})).toBeNull()
    expect(groupEntityOf(null)).toBeNull()
  })
})

describe('AccountGroupEntityLine — #4988.1', () => {
  it('écrit « Groupe Orange · entité analysée Orange Business »', () => {
    render(<AccountGroupEntityLine rawAnalysis={resolution()} />)
    expect(screen.getByTestId('account-group-entity')).toHaveTextContent(
      'Groupe Orange · entité analysée Orange Business',
    )
  })
  it('ne rend rien sans groupe', () => {
    const { container } = render(<AccountGroupEntityLine rawAnalysis={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
