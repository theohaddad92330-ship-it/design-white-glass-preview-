import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_CRM_EXPORT_PROVIDERS,
  CONTACT_CRM_EXPORT_PROVIDERS,
  CRM_PROVIDERS,
  CRM_TOOL_NAMES,
  crmPushTargetsSchema,
  crmPushRequestSchema,
} from '../index.js'

// #4188 — le contrat d'envoi de comptes et de contacts vers le CRM branché.
describe('envoi vers mon CRM — le contrat', () => {
  it('les listes littérales de fournisseurs suivent EXACTEMENT le contrat de l’adaptateur', () => {
    expect([...ACCOUNT_CRM_EXPORT_PROVIDERS]).toEqual([...CRM_PROVIDERS])
    expect([...CONTACT_CRM_EXPORT_PROVIDERS]).toEqual([...CRM_PROVIDERS])
  })

  it('refuse un envoi vide, accepte un compte seul ou un lot', () => {
    expect(crmPushRequestSchema.safeParse({}).success).toBe(false)
    const one = crmPushRequestSchema.parse({ accountIds: ['7a0c2f8e-4b8b-4f2a-9a55-0d0f2d6e1c11'] })
    expect(one).toMatchObject({ contactIds: [], withAccountContacts: false })
    expect(crmPushRequestSchema.safeParse({ contactIds: ['pas-un-uuid'] }).success).toBe(false)
    expect(crmPushRequestSchema.safeParse({ accountIds: [], provider: 'zoho' }).success).toBe(false)
  })

  it('nomme l’OUTIL branché pour chaque fournisseur — une seule table', () => {
    expect(Object.keys(CRM_TOOL_NAMES).sort()).toEqual([...CRM_PROVIDERS].sort())
    expect(CRM_TOOL_NAMES.hubspot).toBe('HubSpot')
  })

  it('un CRM en lecture seule porte sa raison ; le contrat refuse un fournisseur inconnu', () => {
    const ok = crmPushTargetsSchema.safeParse({
      targets: [
        { provider: 'hubspot', destination: 'bellum-it.com', primary: true, writable: true, readOnlyReason: null },
        { provider: 'odoo', destination: null, primary: false, writable: false, readOnlyReason: 'Lecture seule' },
      ],
    })
    expect(ok.success).toBe(true)
    expect(
      crmPushTargetsSchema.safeParse({
        targets: [{ provider: 'sap', destination: null, primary: true, writable: true, readOnlyReason: null }],
      }).success,
    ).toBe(false)
  })
})
