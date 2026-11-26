import { CrmReadService } from './crm-read.service'
import { emptyPresence, domainFromWebsite, latestIso, type CrmPresence } from './crm-presence'
import type { CrmService } from './crm.service'
import type { SalesforceService } from '../salesforce/salesforce.service'

const USER = '11111111-1111-1111-1111-111111111111'

function presence(over: Partial<CrmPresence>): CrmPresence {
  return { ...emptyPresence(), ...over }
}

function makeService(hubspotAnswer: CrmPresence, salesforceAnswer: CrmPresence) {
  const hubspot = { findPresence: jest.fn().mockResolvedValue(hubspotAnswer) }
  const salesforce = { findPresence: jest.fn().mockResolvedValue(salesforceAnswer) }
  const service = new CrmReadService(hubspot as unknown as CrmService, salesforce as unknown as SalesforceService)
  return { hubspot, salesforce, service }
}

describe('CrmReadService — provider-agnostic presence read-back', () => {
  it('is a strict no-op when NO CRM is connected (provider null, matched false)', async () => {
    const { hubspot, salesforce, service } = makeService(emptyPresence(), emptyPresence())
    const result = await service.findAccountPresence(USER, { account: 'SNCF' })
    expect(result).toEqual({
      provider: null,
      matched: false,
      contactsCount: 0,
      contacts: [],
      openDeals: [],
      lastActivityAt: null,
    })
    // Both providers were asked (each is itself a no-op without a connection).
    expect(hubspot.findPresence).toHaveBeenCalledWith(USER, { account: 'SNCF' })
    expect(salesforce.findPresence).toHaveBeenCalledWith(USER, { account: 'SNCF' })
  })

  it('returns the HubSpot answer when HubSpot is the connected CRM (Salesforce never asked)', async () => {
    const hubAnswer = presence({
      provider: 'hubspot',
      matched: true,
      contactsCount: 2,
      contacts: [{ id: '1', name: 'Alice', email: 'a@sncf.fr', jobTitle: 'DSI' }],
    })
    const { salesforce, service } = makeService(hubAnswer, emptyPresence('salesforce'))
    const result = await service.findAccountPresence(USER, { account: 'SNCF', domain: 'sncf.fr' })
    expect(result).toBe(hubAnswer)
    expect(salesforce.findPresence).not.toHaveBeenCalled()
  })

  it("a connected HubSpot with NO match is authoritative — we don't shop around", async () => {
    const { salesforce, service } = makeService(emptyPresence('hubspot'), presence({ provider: 'salesforce' }))
    const result = await service.findAccountPresence(USER, { account: 'SNCF' })
    expect(result.provider).toBe('hubspot')
    expect(result.matched).toBe(false)
    expect(salesforce.findPresence).not.toHaveBeenCalled()
  })

  it('falls through to Salesforce when HubSpot is not connected', async () => {
    const sfAnswer = presence({
      provider: 'salesforce',
      matched: true,
      contactsCount: 1,
      openDeals: [{ id: 'o1', name: 'TMA', stage: 'Proposal', amount: null }],
    })
    const { service } = makeService(emptyPresence(), sfAnswer)
    const result = await service.findAccountPresence(USER, { account: 'SNCF' })
    expect(result).toBe(sfAnswer)
  })

  it('rejects an empty query without asking any provider (nothing to match on)', async () => {
    const { hubspot, salesforce, service } = makeService(emptyPresence('hubspot'), emptyPresence())
    const result = await service.findAccountPresence(USER, { account: '  ', siren: '552049447' })
    expect(result.provider).toBeNull()
    expect(result.matched).toBe(false)
    expect(hubspot.findPresence).not.toHaveBeenCalled()
    expect(salesforce.findPresence).not.toHaveBeenCalled()
  })
})

describe('CrmReadService.describeAccountHistory — couche zéro du plan', () => {
  it('says nothing when NO CRM is connected (the analysis stays byte-identical)', async () => {
    const { service } = makeService(emptyPresence(), emptyPresence())
    await expect(service.describeAccountHistory(USER, { companyName: 'SNCF' })).resolves.toBeUndefined()
  })

  it('says nothing when a connected CRM found NOTHING (« consulté, rien trouvé » is not history)', async () => {
    const { service } = makeService(emptyPresence('hubspot'), emptyPresence())
    await expect(service.describeAccountHistory(USER, { companyName: 'SNCF' })).resolves.toBeUndefined()
  })

  it('renders the real records on a match, and matches on the account website domain', async () => {
    const hubAnswer = presence({
      provider: 'hubspot',
      matched: true,
      contactsCount: 2,
      contacts: [{ id: '1', name: 'Alice Martin', email: 'a@sncf.fr', jobTitle: 'DSI' }],
      openDeals: [{ id: 'o1', name: 'TMA', stage: 'Proposal', amount: 50000 }],
      lastActivityAt: '2026-06-12T09:00:00.000Z',
    })
    const { hubspot, service } = makeService(hubAnswer, emptyPresence())
    const summary = await service.describeAccountHistory(USER, {
      companyName: 'SNCF',
      website: 'https://www.sncf.fr/groupe',
      siren: '552049447',
    })
    expect(hubspot.findPresence).toHaveBeenCalledWith(USER, {
      account: 'SNCF',
      domain: 'sncf.fr',
      siren: '552049447',
    })
    expect(summary).toContain('2 contact(s) déjà dans votre CRM chez ce groupe')
    expect(summary).toContain('Alice Martin (DSI)')
    expect(summary).toContain('1 deal(s) ouvert(s)')
  })

  it('never blocks a run: a CRM read error degrades to no history', async () => {
    const hubspot = { findPresence: jest.fn().mockRejectedValue(new Error('HubSpot 500')) }
    const salesforce = { findPresence: jest.fn() }
    const service = new CrmReadService(hubspot as unknown as CrmService, salesforce as unknown as SalesforceService)
    await expect(service.describeAccountHistory(USER, { companyName: 'SNCF' })).resolves.toBeUndefined()
  })

  it('does not consult anything without a company name', async () => {
    const { hubspot, salesforce, service } = makeService(emptyPresence('hubspot'), emptyPresence())
    await expect(service.describeAccountHistory(USER, { companyName: '  ' })).resolves.toBeUndefined()
    expect(hubspot.findPresence).not.toHaveBeenCalled()
    expect(salesforce.findPresence).not.toHaveBeenCalled()
  })
})

describe('crm-presence helpers', () => {
  it('domainFromWebsite extracts a bare host and rejects junk', () => {
    expect(domainFromWebsite('https://www.sncf.fr/groupe')).toBe('sncf.fr')
    expect(domainFromWebsite('sncf.fr')).toBe('sncf.fr')
    expect(domainFromWebsite('HTTP://WWW.ACME.COM')).toBe('acme.com')
    expect(domainFromWebsite('')).toBeNull()
    expect(domainFromWebsite(null)).toBeNull()
    expect(domainFromWebsite('not a url at all')).toBeNull()
  })

  it('latestIso keeps the max date and ignores invalid entries', () => {
    expect(latestIso(['2026-01-01T00:00:00Z', null, '2026-06-12T09:00:00Z', 'garbage'])).toBe(
      '2026-06-12T09:00:00.000Z',
    )
    expect(latestIso([null, undefined, ''])).toBeNull()
  })
})

describe('CrmReadService.knownContacts (#4070.3)', () => {
  it('rend nom et poste des contacts reconnus — jamais l’e-mail ni l’identifiant CRM', async () => {
    const hub = presence({
      provider: 'hubspot',
      matched: true,
      contactsCount: 1,
      contacts: [{ id: 'c-1', name: 'Claire Martin', email: 'claire@client.test', jobTitle: 'DSI' }],
    })
    const { service } = makeService(hub, emptyPresence())
    const out = await service.knownContacts(USER, { companyName: 'SNCF', website: 'https://www.sncf.com' })
    expect(out).toEqual([{ name: 'Claire Martin', jobTitle: 'DSI' }])
    expect(JSON.stringify(out)).not.toContain('client.test')
  })

  it('NON — aucun CRM connecté, aucun match ou nom vide : liste vide, sans appel inutile', async () => {
    const { hubspot, service } = makeService(emptyPresence(), emptyPresence())
    expect(await service.knownContacts(USER, { companyName: 'SNCF' })).toEqual([])
    hubspot.findPresence.mockClear()
    expect(await service.knownContacts(USER, { companyName: '  ' })).toEqual([])
    expect(hubspot.findPresence).not.toHaveBeenCalled()
  })

  it('NON — un CRM en panne ne fait pas tomber le lancement', async () => {
    const { hubspot, service } = makeService(emptyPresence(), emptyPresence())
    hubspot.findPresence.mockRejectedValueOnce(new Error('429'))
    expect(await service.knownContacts(USER, { companyName: 'SNCF' })).toEqual([])
  })
})
