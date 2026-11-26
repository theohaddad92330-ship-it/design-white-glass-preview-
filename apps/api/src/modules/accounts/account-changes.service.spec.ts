import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { AccountFact } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ACCOUNT_FACTS_READER } from '../account-facts/module-tokens'
import { AccountChangesService } from './account-changes.service'

/**
 * #4180 (EX-10) — « ce qui a changé depuis la dernière vérification », lu sur le VRAI chemin :
 * faits datés (lecteur unique), contacts arrivés, changements d'entité enregistrés.
 */
const WORKSPACE = 'ws-a'
const ACCOUNT = '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55'
const CHECKED = new Date('2026-09-01T00:00:00.000Z')

const fact = (over: Partial<AccountFact>): AccountFact => ({
  date: '2026-09-20',
  kind: 'hiring',
  label: 'Offre',
  weight: 1,
  ageDays: 5,
  ...over,
})

type Sql = { sql: string; params: unknown[] }

async function build(options: {
  facts?: AccountFact[] | null
  newContacts?: Array<Record<string, unknown>>
  totalContacts?: number
  corrections?: Array<Record<string, unknown>>
  entities?: Array<Record<string, unknown>>
  rawAnalysis?: unknown
}) {
  const queries: Sql[] = []
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    queries.push({ sql, params })
    if (sql.includes('FROM org_graph_corrections')) return options.corrections ?? []
    if (sql.includes('FROM account_entities')) return options.entities ?? []
    if (sql.includes('raw_analysis'))
      return options.rawAnalysis === undefined ? [] : [{ raw_analysis: options.rawAnalysis }]
    return []
  })
  const contactsFind = jest.fn(async (_query: { where: Record<string, unknown> }) => options.newContacts ?? [])
  const contactsCount = jest.fn(async (_query: { where: Record<string, unknown> }) => options.totalContacts ?? 0)
  const moduleRef = await Test.createTestingModule({
    providers: [
      AccountChangesService,
      { provide: getRepositoryToken(AccountEntity), useValue: { manager: { query } } },
      { provide: getRepositoryToken(ContactEntity), useValue: { find: contactsFind, count: contactsCount } },
      {
        provide: ACCOUNT_FACTS_READER,
        useValue: {
          forAccount: jest.fn().mockResolvedValue(options.facts === null ? null : { facts: options.facts ?? [] }),
        },
      },
    ],
  }).compile()
  return { service: moduleRef.get(AccountChangesService), queries, contactsFind, contactsCount }
}

const args = { workspaceId: WORKSPACE, userId: 'u1', accountId: ACCOUNT, companyName: 'Aubrac', lastCheckedAt: CHECKED }

describe('AccountChangesService — #4180', () => {
  it('compose managers, entités, offres et événements, chacun daté du FAIT', async () => {
    const { service } = await build({
      facts: [
        fact({ kind: 'hiring', label: '4 ingénieurs PLM', date: '2026-09-15' }),
        fact({ kind: 'signal', label: 'Levée de fonds', date: '2026-09-25' }),
        fact({ kind: 'hiring', label: 'Ancienne offre', date: '2026-08-01' }),
      ],
      newContacts: [
        {
          full_name: 'Camille Durand',
          title: 'Directrice technique',
          entity: 'Division Avions',
          created_at: new Date('2026-09-12T10:00:00Z'),
        },
      ],
      totalContacts: 9,
      corrections: [{ old_value: 'e-old', new_value: 'e-new', created_at: new Date('2026-09-18T08:00:00Z') }],
      entities: [
        { id: 'e-old', name: 'Division Hélicoptères' },
        { id: 'e-new', name: 'Division Avions' },
      ],
    })
    const changes = await service.changes(args)
    expect(changes?.status).toBe('changes')
    expect(changes?.items.map(i => [i.kind, i.date])).toEqual([
      ['business_event', '2026-09-25'],
      ['entity_change', '2026-09-18'],
      ['hiring_offer', '2026-09-15'],
      ['new_manager', '2026-09-12'],
    ])
    expect(changes?.items.find(i => i.kind === 'entity_change')?.label).toContain(
      'Division Hélicoptères → Division Avions',
    )
    expect(changes?.items.find(i => i.kind === 'new_manager')?.entity).toBe('Division Avions')
    expect(changes?.account).toEqual({ id: ACCOUNT, name: 'Aubrac' })
    // Rien d'ancien n'est effacé : les 3 faits et les 9 contacts restent comptés.
    expect(changes?.retained).toEqual({ facts: 3, contacts: 9 })
  })

  // #4180.8 — la ligne d'entité NOMME la personne (nœud de l'organigramme `object_id`) ; sans nom
  // lisible, la ligne reste celle d'avant (« Une personne… »), jamais un identifiant brut.
  it('#4180.8 — nomme la personne qui a changé d’entité quand l’organigramme la porte', async () => {
    const rawAnalysis = { org: { orgGraph: { people: [{ id: 'p-1', fullName: 'Camille Durand' }] } } }
    const entities = [
      { id: 'e-old', name: 'Division Hélicoptères' },
      { id: 'e-new', name: 'Division Avions' },
    ]
    const { service } = await build({
      facts: [],
      corrections: [
        { object_id: 'p-1', old_value: 'e-old', new_value: 'e-new', created_at: new Date('2026-09-18T08:00:00Z') },
        { object_id: 'p-?', old_value: 'e-old', new_value: 'e-new', created_at: new Date('2026-09-17T08:00:00Z') },
      ],
      entities,
      rawAnalysis,
    })
    const labels = (await service.changes(args))?.items.filter(i => i.kind === 'entity_change').map(i => i.label)
    expect(labels).toEqual([
      'Camille Durand a changé d’entité : Division Hélicoptères → Division Avions',
      'Une personne a changé d’entité : Division Hélicoptères → Division Avions',
    ])
  })

  it('toutes les lectures sont bornées à l’espace appelant ET au compte', async () => {
    const { service, queries, contactsFind, contactsCount } = await build({})
    await service.changes(args)
    expect(queries.length).toBeGreaterThanOrEqual(1)
    for (const { sql, params } of queries) {
      expect(sql).toContain('workspace_id = $1')
      expect(params[0]).toBe(WORKSPACE)
      expect(params[1]).toBe(ACCOUNT)
    }
    for (const call of [...contactsFind.mock.calls, ...contactsCount.mock.calls]) {
      expect(call[0].where).toMatchObject({ workspace_id: WORKSPACE, account_id: ACCOUNT })
    }
    expect(contactsFind).toHaveBeenCalled()
    expect(contactsCount).toHaveBeenCalled()
  })

  it('« rien de nouveau » : se dit, et n’efface aucun contact ni fait ancien', async () => {
    const { service } = await build({ facts: [fact({ date: '2026-08-01' })], totalContacts: 4 })
    const changes = await service.changes(args)
    expect(changes?.status).toBe('nothing_new')
    expect(changes?.retained).toEqual({ facts: 1, contacts: 4 })
  })

  it('sans dernière vérification, aucune comparaison — et aucune lecture inutile', async () => {
    const { service, queries, contactsFind } = await build({ facts: [fact({})] })
    const changes = await service.changes({ ...args, lastCheckedAt: null })
    expect(changes?.status).toBe('no_reference')
    expect(queries).toHaveLength(0)
    expect(contactsFind).not.toHaveBeenCalled()
  })

  it('NON : un changement d’entité dont on ne sait pas nommer les entités n’est pas affiché', async () => {
    const { service } = await build({
      corrections: [{ old_value: 'e-x', new_value: 'e-y', created_at: new Date('2026-09-18T08:00:00Z') }],
      entities: [],
    })
    expect((await service.changes(args))?.status).toBe('nothing_new')
  })

  it('un compte absent de l’espace rend null — rien n’est lu', async () => {
    const { service } = await build({ facts: null })
    expect(await service.changes(args)).toBeNull()
  })
})
