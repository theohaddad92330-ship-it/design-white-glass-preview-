import { hubspotCompanySource, hubspotContactSource } from './crm-sources'
import type { CrmService } from './crm.service'

/**
 * La source importable HubSpot.
 *
 * Un seul comportement compte ici et il a été trouvé EN PRODUCTION : la demande
 * par défaut (200) dépasse ce qu'une requête HubSpot rend (100), donc la source
 * doit BOUCLER sur le curseur. La version d'avant passait 200 d'un coup et
 * HubSpot refusait l'appel entier — la reprise ne pouvait aboutir sur aucun
 * portail réel.
 */
function contact(id: string) {
  return { id, email: `${id}@acme.fr`, firstName: 'Marie', lastName: 'Durand' }
}

function fakeCrm(pages: { contacts: ReturnType<typeof contact>[]; nextAfter: string | null }[]) {
  const seen: { limit: number; after?: string }[] = []
  let index = 0
  const crm = {
    listContacts: async (_userId: string, opts: { limit: number; after?: string }) => {
      seen.push(opts)
      return pages[index++] ?? { contacts: [], nextAfter: null }
    },
  } as unknown as CrmService
  return { crm, seen }
}

describe('hubspotContactSource', () => {
  it('BOUCLE sur le curseur jusqu’à la demande', async () => {
    const { crm, seen } = fakeCrm([
      { contacts: [contact('a'), contact('b')], nextAfter: 'cur-1' },
      { contacts: [contact('c')], nextAfter: null },
    ])
    const page = await hubspotContactSource(crm).listContacts('u1', 3)

    expect(page.records.map(r => r.externalId)).toEqual(['a', 'b', 'c'])
    expect(page.truncated).toBe(false)
    // Le curseur de la 1re page est passé à la 2e — sans lui on relirait la même.
    expect(seen[1]?.after).toBe('cur-1')
  })

  it('s’arrête à la demande et ANNONCE qu’il reste des contacts', async () => {
    // « 200 contacts importés » sur une base de 3000 se lit comme une fin.
    const { crm } = fakeCrm([{ contacts: [contact('a'), contact('b')], nextAfter: 'cur-1' }])
    const page = await hubspotContactSource(crm).listContacts('u1', 2)

    expect(page.records).toHaveLength(2)
    expect(page.truncated).toBe(true)
  })

  it('ne demande jamais plus que ce qu’il reste à collecter', async () => {
    const { crm, seen } = fakeCrm([
      { contacts: [contact('a'), contact('b')], nextAfter: 'cur-1' },
      { contacts: [contact('c')], nextAfter: null },
    ])
    await hubspotContactSource(crm).listContacts('u1', 5)

    expect(seen[0]?.limit).toBe(5)
    expect(seen[1]?.limit).toBe(3)
  })

  it('une page VIDE avec un curseur arrête la boucle au lieu de tourner sans fin', async () => {
    const { crm } = fakeCrm([
      { contacts: [], nextAfter: 'cur-1' },
      { contacts: [], nextAfter: 'cur-2' },
    ])
    const page = await hubspotContactSource(crm).listContacts('u1', 200)

    expect(page.records).toHaveLength(0)
    // Tronqué, parce qu'on n'a PAS la preuve que le CRM est vide — et « ton CRM
    // est vide » est exactement le mensonge que cette tranche existe pour éviter.
    expect(page.truncated).toBe(true)
  })

  it('un nom vide reste null plutôt qu’une chaîne vide', async () => {
    const { crm } = fakeCrm([
      { contacts: [{ id: 'z', email: null, firstName: null, lastName: null } as never], nextAfter: null },
    ])
    const page = await hubspotContactSource(crm).listContacts('u1', 10)
    expect(page.records[0]).toEqual({ externalId: 'z', email: null, name: null })
  })
})

// #2388.24 — même boucle de curseur, côté sociétés.
function company(id: string, name: string | null = 'Acme'): { id: string; name: string | null; siren?: string | null } {
  return { id, name }
}

function fakeCrmCompanies(pages: { companies: ReturnType<typeof company>[]; nextAfter: string | null }[]) {
  const seen: { limit: number; after?: string }[] = []
  let index = 0
  const crm = {
    listCompanies: async (_userId: string, opts: { limit: number; after?: string }) => {
      seen.push(opts)
      return pages[index++] ?? { companies: [], nextAfter: null }
    },
  } as unknown as CrmService
  return { crm, seen }
}

describe('hubspotCompanySource (#2388.24)', () => {
  it('BOUCLE sur le curseur jusqu’à la demande', async () => {
    const { crm, seen } = fakeCrmCompanies([
      { companies: [company('co-1'), company('co-2')], nextAfter: 'cur-1' },
      { companies: [company('co-3')], nextAfter: null },
    ])
    const page = await hubspotCompanySource(crm).listCompanies('u1', 3)

    expect(page.records.map(r => r.externalId)).toEqual(['co-1', 'co-2', 'co-3'])
    expect(page.records.every(r => r.email === null)).toBe(true)
    expect(page.truncated).toBe(false)
    expect(seen[1]?.after).toBe('cur-1')
  })

  it('s’arrête à la demande et ANNONCE qu’il reste des sociétés', async () => {
    const { crm } = fakeCrmCompanies([{ companies: [company('co-1'), company('co-2')], nextAfter: 'cur-1' }])
    const page = await hubspotCompanySource(crm).listCompanies('u1', 2)

    expect(page.records).toHaveLength(2)
    expect(page.truncated).toBe(true)
  })

  it('un nom vide reste null', async () => {
    const { crm } = fakeCrmCompanies([{ companies: [company('co-1', null)], nextAfter: null }])
    const page = await hubspotCompanySource(crm).listCompanies('u1', 10)
    expect(page.records[0]).toEqual({ externalId: 'co-1', email: null, name: null })
  })

  it('#4603 — le SIREN porté par la société côté CRM voyage jusqu’à la ligne d’import', async () => {
    const { crm } = fakeCrmCompanies([
      { companies: [{ ...company('co-1', 'Veepee'), siren: '440297785' }], nextAfter: null },
    ])
    const page = await hubspotCompanySource(crm).listCompanies('u1', 10)
    expect(page.records[0]).toEqual({ externalId: 'co-1', email: null, name: 'Veepee', siren: '440297785' })
  })
})
