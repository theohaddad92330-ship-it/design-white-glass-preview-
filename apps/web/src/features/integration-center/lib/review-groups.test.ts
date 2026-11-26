import type { CrmReadStatus } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildReviewGroups } from './review-groups'

const status = (over: Partial<CrmReadStatus>): CrmReadStatus => ({
  provider: 'hubspot',
  accountLabel: null,
  objects: ['contacts'],
  incremental: null,
  lastSyncAt: null,
  lastError: null,
  conflicts: 0,
  ...over,
})

describe('Théo D settings-integrations.N3 — les groupes de l’onglet À relire', () => {
  it('deux champs d’une même fiche font UN groupe', () => {
    const groups = buildReviewGroups([
      status({
        conflictItems: [
          {
            id: 'e1',
            entityType: 'contact',
            entityLabel: 'Paul Ferrer',
            field: 'email',
            bellumValue: 'a',
            crmValue: 'b',
            at: '2026-10-22T08:40:00Z',
          },
          {
            id: 'e1',
            entityType: 'contact',
            entityLabel: 'Paul Ferrer',
            field: 'full_name',
            bellumValue: 'c',
            crmValue: 'd',
            at: '2026-10-22T08:40:00Z',
          },
        ],
      }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.fields.map(f => f.field)).toEqual(['email', 'full_name'])
    expect(groups[0]?.eventId).toBe('e1')
  })

  it('⚠️ SAIT DIRE NON — aucun écart, aucun groupe (une absence ne fait pas de ligne)', () => {
    expect(buildReviewGroups([status({}), status({ conflictItems: [] })])).toEqual([])
  })

  it('le plus récent d’abord, et chaque groupe garde l’outil qui l’a vu', () => {
    const groups = buildReviewGroups([
      status({
        provider: 'salesforce',
        conflictItems: [
          {
            id: 'old',
            entityType: 'account',
            field: 'company_name',
            bellumValue: 'A',
            crmValue: 'B',
            at: '2026-10-01T00:00:00Z',
          },
        ],
      }),
      status({
        provider: 'hubspot',
        conflictItems: [
          {
            id: 'new',
            entityType: 'account',
            field: 'company_name',
            bellumValue: 'C',
            crmValue: 'D',
            at: '2026-10-20T00:00:00Z',
          },
        ],
      }),
    ])
    expect(groups.map(g => [g.key, g.provider])).toEqual([
      ['new', 'hubspot'],
      ['old', 'salesforce'],
    ])
  })

  it('la ligne de démonstration (sans identifiant) est marquée démo : ses gestes seront des aperçus', () => {
    const [group] = buildReviewGroups([
      status({
        demo: true,
        conflictItems: [
          {
            entityType: 'account',
            entityLabel: 'Orange',
            field: 'company_name',
            bellumValue: 'Orange',
            crmValue: 'Orange SA',
            at: '2026-10-22T06:00:00Z',
          },
        ],
      }),
    ])
    expect(group?.demo).toBe(true)
    expect(group?.eventId).toBeNull()
  })
})
