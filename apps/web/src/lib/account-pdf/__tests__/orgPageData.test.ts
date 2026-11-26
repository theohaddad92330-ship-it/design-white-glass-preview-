import { orgGraphSchema, type Contact, type OrgGraph } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildAccountPdfOrgPage } from '../orgPageData'

/**
 * `buildAccountPdfOrgPage` is a thin READ-ONLY wrapper around the same
 * derivation the Organigramme tab already uses (`buildFocalOrgView` +
 * `buildOrgGraphViewData`) — see focalOrgData.ts's docblock: « une dérivation
 * vit à un seul endroit ». These tests exercise the wrapper, not the
 * derivation itself (already covered by `focalOrgData.test.ts`).
 */

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

function person(over: Record<string, unknown>) {
  return {
    identityStatus: 'classified' as const,
    confidence: 60,
    sources: [],
    decisionRoles: [],
    ...over,
  }
}

function graph(over: Record<string, unknown> = {}): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 3,
    entities: [{ id: 'e-ds', name: 'AIRBUS DS', type: 'filiale', parentId: null, confidence: 90, sources: [SOURCE] }],
    people: [
      person({
        id: 'p-schoellhorn',
        fullName: 'M. Schoellhorn',
        title: 'CEO Defence & Space',
        entityId: 'e-ds',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'actionable',
        confidence: 92,
        sources: [SOURCE],
      }),
      person({
        id: 'p-werner',
        fullName: 'Claudia Werner',
        title: 'Engineering Director',
        entityId: 'e-ds',
        hierarchyLevel: 'L2',
        decisionRoles: ['champion'],
      }),
    ],
    hierarchyEdges: [
      {
        fromId: 'p-werner',
        toId: 'p-schoellhorn',
        type: 'reports_to',
        sourceIds: [SOURCE.id],
        confidence: 95,
        verified: true,
      },
    ],
    influenceEdges: [],
    buyingCommittee: [{ personId: 'p-schoellhorn', role: 'economic_buyer', entityId: 'e-ds' }],
    uncoveredZones: [],
    recommendedPath: [{ step: 1, personId: 'p-schoellhorn', objective: 'ouvrir le périmètre' }],
    rejectedItems: [],
    ...over,
  })
}

function contact(id: string, full_name: string): Contact {
  return { id, account_id: 'a1', full_name } as unknown as Contact
}

describe('buildAccountPdfOrgPage', () => {
  it('is null when raw_analysis carries no org graph — the page is simply omitted', () => {
    expect(buildAccountPdfOrgPage(null, [])).toBeNull()
    expect(buildAccountPdfOrgPage({}, [])).toBeNull()
  })

  it('reads the SAME graph the Organigramme tab reads (raw_analysis.org.orgGraph)', () => {
    const view = buildAccountPdfOrgPage({ org: { orgGraph: graph() } }, [])
    expect(view).not.toBeNull()
    expect(view?.direction.name).toBe('AIRBUS DS')
    expect(view?.levelRows.map(row => row.level)).toEqual(['L1', 'L2'])
  })

  it('discovered comes from the LIVE contact list, not the graph snapshot (same rule as the tab)', () => {
    const contacts = [contact('c1', 'A'), contact('c2', 'B'), contact('c3', 'C')]
    const view = buildAccountPdfOrgPage({ org: { orgGraph: graph() } }, contacts)
    expect(view?.coverage.discovered).toBe(3)
  })

  it('never fabricates a direction — no directions means no page', () => {
    const empty = graph({ people: [], hierarchyEdges: [], buyingCommittee: [], recommendedPath: [] })
    expect(buildAccountPdfOrgPage({ org: { orgGraph: empty } }, [])).toBeNull()
  })
})
