import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { BASE_MATCHES_SOURCE, type BaseMatchesSource } from './base-matches-source'
import { DiscoverSourcesService } from './discover-sources.service'

/**
 * #4792 (épopée #4791) — L'APPELANT N°2 EST PROUVÉ : Découvrir lit NOTRE BASE par le lecteur commun.
 *
 * Le constat de l'épopée : Découvrir coupait sa liste à `limit` sans savoir ce que la base portait.
 * Ce test prouve que le chemin Découvrir appelle réellement le lecteur, avec les critères de la
 * recherche et le périmètre résolu — et qu'il reste best-effort : sans port, sur une lecture en
 * échec, ou sans critère, la coupe est EXACTEMENT celle d'avant ce lot.
 */

const WS = 'ws-1'
const BU = '33333333-3333-4333-8333-333333333333'

const accountRow = (siren: string | null) => ({
  source: 'account_record' as const,
  collectedAt: '2026-05-01T10:00:00.000Z',
  accountId: 'acc-1',
  companyName: 'Client Exemple',
  sector: null,
  place: 'Lille (59)',
  siren,
  businessUnitId: null,
})

async function build(options: { port?: BaseMatchesSource | null; rows?: unknown[]; fail?: boolean } = {}) {
  const read = jest.fn(async () => {
    if (options.fail) throw new Error('lecture en échec')
    const rows = options.rows ?? [accountRow('552081317'), accountRow('999999999')]
    return { readAt: 'x', accounts: { total: rows.length, offset: 0, limit: 100, hasMore: false, rows } }
  })
  const port = 'port' in options ? options.port : ({ read } as unknown as BaseMatchesSource)
  const moduleRef = await Test.createTestingModule({
    providers: [
      DiscoverSourcesService,
      { provide: getRepositoryToken(AccountEntity), useValue: { manager: { query: jest.fn(async () => []) } } },
      { provide: getRepositoryToken(ContactEntity), useValue: { createQueryBuilder: () => ({}) } },
      { provide: BASE_MATCHES_SOURCE, useValue: port },
    ],
  }).compile()
  return { service: moduleRef.get(DiscoverSourcesService), read }
}

describe('#4792 — Découvrir appelle le lecteur commun', () => {
  it('appelle le lecteur avec les critères de la recherche, le périmètre entier, et rend ses SIREN', async () => {
    const { service, read } = await build()
    const sirens = await service.baseAccountSirens(
      WS,
      { businessUnitIds: [BU], includeUnassigned: true },
      { keywords: ['Java'], city: 'Lille' },
      96,
    )
    expect(read).toHaveBeenCalledTimes(1)
    const [scope, criteria] = read.mock.calls[0] as unknown as [
      { workspaceId: string; businessUnitScope: unknown },
      { terms: string[]; city: string | null; families: string[]; limit: number },
    ]
    expect(scope).toEqual({ workspaceId: WS, businessUnitScope: { businessUnitIds: [BU], includeUnassigned: true } })
    expect(criteria.terms).toEqual(['Java'])
    expect(criteria.city).toBe('Lille')
    expect(criteria.families).toEqual(['accounts'])
    expect(criteria.limit).toBe(96)
    expect(sirens).toEqual(['552081317', '999999999'])
  })

  it('un SIREN absent ou mal formé ne ressort pas — jamais un identifiant deviné', async () => {
    const { service } = await build({ rows: [accountRow(null), accountRow('12345'), accountRow('552081317')] })
    expect(await service.baseAccountSirens(WS, null, { city: 'Lille' }, 96)).toEqual(['552081317'])
  })

  it('sans critère de métier NI de lieu, elle ne lit RIEN : la coupe reste celle d’avant', async () => {
    const { service, read } = await build()
    expect(await service.baseAccountSirens(WS, null, {}, 96)).toEqual([])
    expect(await service.baseAccountSirens(WS, null, undefined, 96)).toEqual([])
    expect(read).not.toHaveBeenCalled()
  })

  it('sans espace, ou sans borne valide, elle ne lit rien', async () => {
    const { service, read } = await build()
    expect(await service.baseAccountSirens('', null, { city: 'Lille' }, 96)).toEqual([])
    expect(await service.baseAccountSirens(WS, null, { city: 'Lille' }, 0)).toEqual([])
    expect(read).not.toHaveBeenCalled()
  })

  it('sans le port, Découvrir garde EXACTEMENT la coupe qu’il avait avant ce lot', async () => {
    const { service } = await build({ port: null })
    expect(await service.baseAccountSirens(WS, null, { city: 'Lille' }, 96)).toEqual([])
  })

  it('une lecture en échec est non-fatale : `[]`, journalisée, jamais une panne de Découvrir', async () => {
    const { service } = await build({ fail: true })
    expect(await service.baseAccountSirens(WS, null, { city: 'Lille' }, 96)).toEqual([])
  })
})
