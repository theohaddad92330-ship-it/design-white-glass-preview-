import { describe, expect, it } from 'vitest'
import type { OrgGraphCorrection } from '@bellum/contracts'
import { contactCorrectionsFor } from './contactCorrections'

/**
 * #2150.60 — « la fiche Contact conserve les corrections. »
 *
 * Le ledger (`org_graph_corrections`, GET /accounts/:id/org-graph/corrections)
 * est déjà LU par l'onglet Organigramme du compte — un seul endpoint
 * (GA-26). Ce fichier ne fait qu'un tri, CÔTÉ CLIENT : la fiche d'UN contact
 * ne montre que ce qui LE concerne — sa fiche `person`, ou un lien
 * `reportsTo`/hiérarchique dont il est un bout.
 */
function correction(over: Partial<OrgGraphCorrection> = {}): OrgGraphCorrection {
  return {
    id: 'c-1',
    workspaceId: 'ws-1',
    accountId: 'acc-1',
    graphVersionBefore: 1,
    graphVersionAfter: 2,
    objectType: 'person',
    objectId: 'contact-1',
    field: 'title',
    oldValue: 'DSI',
    newValue: 'DSI Groupe',
    reason: 'Vu sur LinkedIn',
    evidence: { kind: 'PUBLIC' },
    userId: 'user-1',
    createdAt: '2026-09-20T10:00:00Z',
    revertedAt: null,
    motive: 'corrected',
    scope: 'account',
    visibility: 'workspace',
    ...over,
  } as OrgGraphCorrection
}

describe('contactCorrectionsFor — #2150.60', () => {
  it('garde une correction "person" posée SUR ce contact', () => {
    const out = contactCorrectionsFor([correction({ objectId: 'contact-1' })], 'contact-1')
    expect(out).toHaveLength(1)
  })

  it('écarte une correction "person" posée sur un AUTRE contact', () => {
    const out = contactCorrectionsFor([correction({ objectId: 'contact-2' })], 'contact-1')
    expect(out).toHaveLength(0)
  })

  it('garde une correction "edge" dont ce contact est un bout (reportsTo)', () => {
    const edge = correction({ objectType: 'edge', objectId: 'contact-1|reports_to|contact-9', field: 'presence' })
    expect(contactCorrectionsFor([edge], 'contact-1')).toHaveLength(1)
    expect(contactCorrectionsFor([edge], 'contact-9')).toHaveLength(1)
  })

  it('écarte une correction "edge" qui ne touche pas ce contact', () => {
    const edge = correction({ objectType: 'edge', objectId: 'contact-2|reports_to|contact-9', field: 'presence' })
    expect(contactCorrectionsFor([edge], 'contact-1')).toHaveLength(0)
  })

  it('une correction ANNULÉE reste — on archive, on ne supprime pas', () => {
    const out = contactCorrectionsFor(
      [correction({ objectId: 'contact-1', revertedAt: '2026-09-21T10:00:00Z' })],
      'contact-1',
    )
    expect(out).toHaveLength(1)
  })
})
