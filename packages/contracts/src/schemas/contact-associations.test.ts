import { describe, expect, it } from 'vitest'
import {
  contactAssociationsSchema,
  contactEmploymentState,
  sortContactAssociations,
  type ContactAssociationItem,
} from './contact-associations.js'

const ID = '00000000-0000-4000-8000-000000000001'
const item = (over: Partial<ContactAssociationItem>): ContactAssociationItem => ({
  kind: 'project',
  id: ID,
  name: 'Refonte SI',
  state: 'qualified',
  role: 'sponsor',
  basis: 'documented',
  project_id: null,
  ...over,
})

describe('contact associations (#3712)', () => {
  it('l’emploi n’est « actuel » que vérifié ; historique reste historique ; le reste est à vérifier', () => {
    expect(contactEmploymentState({ lifecycle_state: 'actionnable', employment_verified_at: '2026-09-01' })).toBe(
      'current',
    )
    expect(contactEmploymentState({ lifecycle_state: 'actionnable', employment_verified_at: null })).toBe('to_verify')
    expect(contactEmploymentState({ lifecycle_state: 'historique', employment_verified_at: '2026-09-01' })).toBe(
      'historical',
    )
    expect(contactEmploymentState({ lifecycle_state: null, employment_verified_at: undefined })).toBe('to_verify')
  })

  it('le documenté passe avant le déclaré, puis projets → besoins → missions', () => {
    const sorted = sortContactAssociations([
      item({ kind: 'mission', basis: 'declared', role: 'billing' }),
      item({ kind: 'need', id: '00000000-0000-4000-8000-000000000002' }),
      item({ kind: 'project' }),
    ])
    expect(sorted.map(i => `${i.basis}:${i.kind}`)).toEqual([
      'documented:project',
      'documented:need',
      'declared:mission',
    ])
  })

  it('le schéma accepte un contact sans aucun dossier (compte seul) et refuse un objet sans identité', () => {
    const base = {
      contact_id: ID,
      account: { id: ID, name: 'Acme' },
      entity: null,
      entity_label: null,
      employment: 'to_verify',
    }
    expect(contactAssociationsSchema.safeParse({ ...base, items: [] }).success).toBe(true)
    expect(contactAssociationsSchema.safeParse({ ...base, items: [{ ...item({}), id: 'pas-un-uuid' }] }).success).toBe(
      false,
    )
  })
})
