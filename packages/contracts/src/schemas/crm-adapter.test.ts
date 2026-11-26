import { describe, expect, it } from 'vitest'
import {
  CRM_ADAPTER_OPERATIONS,
  CRM_OAUTH_PROVIDERS,
  CRM_PROVIDER_CAPABILITIES,
  CRM_INCREMENTAL_PROVIDERS,
  CRM_INCREMENTAL_SYNC,
  CRM_PROVIDER_READ_SCOPE,
  CRM_PROVIDERS,
  crmProviderSchema,
  crmProvidersSupporting,
  crmReadsObject,
  crmSupports,
} from '../index.js'

// #4185.1 — le contrat de l'adaptateur CRM commun.
describe('adaptateur CRM commun — le contrat', () => {
  it('chaque fournisseur déclaré a une ligne de capacités, et porte au moins `status` et `upsert_contact`', () => {
    for (const provider of CRM_PROVIDERS) {
      const capability = CRM_PROVIDER_CAPABILITIES[provider]
      expect(capability).toBeDefined()
      expect(capability.operations).toContain('status')
      expect(capability.operations).toContain('upsert_contact')
      for (const operation of capability.operations) expect(CRM_ADAPTER_OPERATIONS).toContain(operation)
    }
  })

  it('la matrice dit l’état mesuré : Odoo ne dépose pas de besoin, tous relisent (#4189), Zoho dépose', () => {
    expect(crmSupports('odoo', 'task_note')).toBe(false)
    expect(crmProvidersSupporting('read')).toEqual(['hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'])
    expect(crmProvidersSupporting('task_note')).toEqual(['hubspot', 'salesforce', 'pipedrive', 'attio', 'zoho'])
  })

  it('Odoo se branche par identifiants, jamais par un rappel OAuth ; Zoho par OAuth (#4187)', () => {
    expect(CRM_OAUTH_PROVIDERS).toEqual(['hubspot', 'salesforce', 'pipedrive', 'attio', 'zoho'])
  })

  it('un fournisseur inconnu est refusé par le schéma', () => {
    expect(crmProviderSchema.safeParse('sugarcrm').success).toBe(false)
    expect(crmProviderSchema.safeParse('odoo').success).toBe(true)
    expect(crmProviderSchema.safeParse('zoho').success).toBe(true)
  })

  // #4189 — le périmètre LU, par fournisseur : une seule source de vérité pour l'écran.
  describe('périmètre de lecture (#4189)', () => {
    it('tout fournisseur qui porte `read` déclare au moins ses comptes et ses contacts', () => {
      for (const provider of crmProvidersSupporting('read')) {
        expect(CRM_PROVIDER_READ_SCOPE[provider]).toEqual(expect.arrayContaining(['accounts', 'contacts']))
      }
    })

    it('⚠️ SAIT DIRE NON — un objet que le CRM n’expose pas (ou dont le droit n’est pas demandé) n’est PAS déclaré', () => {
      // Zoho : aucun droit de lecture des tâches n'est demandé (scopes minimaux) → pas d'activités.
      expect(crmReadsObject('zoho', 'activities')).toBe(false)
      expect(crmReadsObject('zoho', 'owners')).toBe(true)
      // Attio : tâches et notes demandent un droit que l'intégration ne demande pas.
      expect(crmReadsObject('attio', 'activities')).toBe(false)
      expect(crmReadsObject('salesforce', 'activities')).toBe(true)
      expect(crmReadsObject('odoo', 'deals')).toBe(true)
    })

    it('un fournisseur qui ne porte pas `read` ne déclare aucun objet lu', () => {
      for (const provider of CRM_PROVIDERS) {
        if (!crmSupports(provider, 'read')) expect(CRM_PROVIDER_READ_SCOPE[provider]).toEqual([])
      }
    })

    it('la synchro incrémentale dit sur QUOI elle se cale : Attio ne voit que les créations, et sa lecture n’est pas ordonnée', () => {
      expect(CRM_INCREMENTAL_SYNC.attio).toEqual({ cursor: 'created_at', ordered: false })
      expect(CRM_INCREMENTAL_SYNC.zoho).toEqual({ cursor: 'modified_at', ordered: true })
    })

    it('HubSpot est dans la synchro incrémentale : lecture « depuis » par l’API search, triée par date de modification', () => {
      expect(CRM_INCREMENTAL_PROVIDERS).toEqual(['hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'])
      expect(CRM_INCREMENTAL_SYNC.hubspot).toEqual({ cursor: 'modified_at', ordered: true })
    })
  })
})
