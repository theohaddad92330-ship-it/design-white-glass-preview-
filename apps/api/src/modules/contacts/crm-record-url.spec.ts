import { crmRecordUrl } from './crm-record-url'

describe('crmRecordUrl (#3719.5)', () => {
  it('HubSpot : compose le lien vers la fiche, avec le portail (hub id)', () => {
    const url = crmRecordUrl('hubspot', 'crm-42', { external_account_id: '98765', instance_url: null })
    expect(url).toBe('https://app.hubspot.com/contacts/98765/record/0-1/crm-42')
  })

  it('Salesforce : compose le lien sur le domaine de l’instance (`instance_url`)', () => {
    const url = crmRecordUrl('salesforce', '003XXXXXXXXXXXXXXX', {
      external_account_id: null,
      instance_url: 'https://acme.my.salesforce.com',
    })
    expect(url).toBe('https://acme.my.salesforce.com/003XXXXXXXXXXXXXXX')
  })

  it('Salesforce : retire le slash final de `instance_url` avant de composer', () => {
    const url = crmRecordUrl('salesforce', '003XXX', {
      external_account_id: null,
      instance_url: 'https://acme.my.salesforce.com/',
    })
    expect(url).toBe('https://acme.my.salesforce.com/003XXX')
  })

  it('Pipedrive : compose le lien `/person/<id>` sur le domaine de l’espace (`instance_url` = api_domain)', () => {
    const url = crmRecordUrl('pipedrive', '77', {
      external_account_id: null,
      instance_url: 'https://acme.pipedrive.com',
    })
    expect(url).toBe('https://acme.pipedrive.com/person/77')
  })

  it("Attio : jamais de lien — l'URL de base de l'espace n'est pas exposée par le statut (doctrine : un contrat non vérifiable ne se devine pas)", () => {
    expect(crmRecordUrl('attio', 'rec-1', { external_account_id: 'acc-1', instance_url: null })).toBeNull()
  })

  it('aucune connexion ⇒ aucun lien', () => {
    expect(crmRecordUrl('hubspot', 'crm-42', null)).toBeNull()
  })

  it("HubSpot sans `external_account_id` (hub id inconnu) ⇒ aucun lien plutôt qu'un lien incomplet", () => {
    expect(crmRecordUrl('hubspot', 'crm-42', { external_account_id: null, instance_url: null })).toBeNull()
  })

  it("Salesforce sans `instance_url` ⇒ aucun lien plutôt qu'un lien incomplet", () => {
    expect(crmRecordUrl('salesforce', '003XXX', { external_account_id: null, instance_url: null })).toBeNull()
  })

  it("Pipedrive sans `instance_url` ⇒ aucun lien plutôt qu'un lien incomplet", () => {
    expect(crmRecordUrl('pipedrive', '77', { external_account_id: null, instance_url: null })).toBeNull()
  })

  it("une `instance_url` qui n'est pas du HTTPS n'est jamais composée dans un lien (donnée corrompue, pas un format à deviner)", () => {
    expect(
      crmRecordUrl('salesforce', '003XXX', { external_account_id: null, instance_url: 'javascript:alert(1)' }),
    ).toBeNull()
  })

  it("Zoho : l'URL d'une fiche demande l'identifiant d'organisation, qu'on ne possède pas — aucun lien, jamais deviné (#4187)", () => {
    expect(
      crmRecordUrl('zoho', '123', { external_account_id: null, instance_url: 'https://www.zohoapis.eu' }),
    ).toBeNull()
  })
})
