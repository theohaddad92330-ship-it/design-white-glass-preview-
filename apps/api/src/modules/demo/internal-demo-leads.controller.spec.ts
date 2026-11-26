import type { DemoLeadEntity } from '../../database/entities/demo-lead.entity'
import { InternalDemoLeadsController } from './internal-demo-leads.controller'
import type { DemoLeadService } from './demo-lead.service'

function lead(overrides: Partial<DemoLeadEntity> = {}): DemoLeadEntity {
  return {
    id: 'lead-1',
    first_name: 'Marie',
    last_name: 'Dupont',
    email: 'marie.dupont@acme.fr',
    job_title: 'sales_director',
    company: 'Acme',
    phone: null,
    device_id: 'device-1',
    source: 'demo',
    first_access_at: new Date('2026-09-22T10:00:00.000Z'),
    last_access_at: new Date('2026-09-22T11:00:00.000Z'),
    access_count: 2,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    ...overrides,
  } as DemoLeadEntity
}

// #2706.2/#2706.3 — la porte interne du back-office : la forme exacte que
// `@/lib/prospects.ts` consomme, et l'absence qui ne fabrique aucune valeur.
describe('InternalDemoLeadsController.list', () => {
  it('rend les leads, la plus récente d’abord (délégué au service)', async () => {
    const listMostRecentFirst = jest.fn(async () => [lead()])
    const controller = new InternalDemoLeadsController({ listMostRecentFirst } as unknown as DemoLeadService)

    const { items } = await controller.list()

    expect(listMostRecentFirst).toHaveBeenCalledTimes(1)
    expect(items).toEqual([
      expect.objectContaining({
        id: 'lead-1',
        firstName: 'Marie',
        lastName: 'Dupont',
        email: 'marie.dupont@acme.fr',
        jobTitle: 'sales_director',
        company: 'Acme',
        accessCount: 2,
        source: 'demo',
      }),
    ])
  })

  // « On n'affiche pas ce qu'on n'a pas » — un téléphone/UTM absent ne
  // fabrique jamais `null` ni `''` : `undefined`, qui DISPARAÎT de la réponse
  // JSON réelle (`JSON.stringify` retire les clés `undefined`), jamais une
  // valeur devinée que le tableau du back-office pourrait rendre par erreur.
  it('un téléphone et des UTM absents ne fabriquent aucune valeur', async () => {
    const listMostRecentFirst = jest.fn(async () => [lead({ phone: null, utm_source: null })])
    const controller = new InternalDemoLeadsController({ listMostRecentFirst } as unknown as DemoLeadService)

    const { items } = await controller.list()

    expect(items[0]?.phone).toBeUndefined()
    expect(items[0]?.utmSource).toBeUndefined()
    expect(JSON.parse(JSON.stringify(items[0]))).not.toHaveProperty('phone')
    expect(JSON.parse(JSON.stringify(items[0]))).not.toHaveProperty('utmSource')
  })

  it('un téléphone présent est porté', async () => {
    const listMostRecentFirst = jest.fn(async () => [lead({ phone: '+33612345678' })])
    const controller = new InternalDemoLeadsController({ listMostRecentFirst } as unknown as DemoLeadService)

    const { items } = await controller.list()

    expect(items[0]?.phone).toBe('+33612345678')
  })
})
