import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { accountMarketPathsSchema } from '@bellum/contracts'
import { AccountsController } from './accounts.controller'
import type { AccountsService } from './accounts.service'
import type { MarketPersonPathView } from '../market-memory/market-person-path-view'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/** #5192 (lot 781) — `GET /accounts/:id/market-paths` : le détail des parcours, cloisonné, SANS identifiant. */
const USER: CurrentUserPayload = { userId: 'user-1', email: 'user@esn.fr' }
const ID = '11111111-1111-4111-8111-111111111111'
const COMPTE = { id: ID, company_name: 'THALES', website: 'thalesgroup.com', registry_country: 'FR' }
const PATH: MarketPersonPathView = {
  id: 'row-secret-1',
  jobTitle: 'Data Engineer',
  roleFamily: 'Data',
  skills: ['Kafka'],
  startDate: '2023-01-01',
  endDate: null,
  datePrecision: 'month',
  workStatus: 'freelance',
  esnName: 'Alten',
  dailyRateEur: 650,
  missionCity: 'Lyon',
  missionRegion: null,
  isCurrent: null,
}

function build(options: {
  paths?: MarketPersonPathView[]
  unavailable?: boolean
  absent?: boolean
  missing?: boolean
}) {
  const personPathsFor = jest.fn(async (lookups: ReadonlyArray<{ ref: string }>) =>
    options.unavailable
      ? ({ status: 'unavailable', reason: 'read_failed' } as const)
      : ({ status: 'ok', paths: new Map(lookups.map(l => [l.ref, options.paths ?? []])) } as const),
  )
  const findOneForWorkspace = jest
    .fn()
    .mockResolvedValue(
      options.missing
        ? { type: 'failure', problem: { code: 'not_found', message: 'Compte introuvable' } }
        : { type: 'success', output: COMPTE },
    )
  const scopeFor = jest.fn().mockResolvedValue('bu-scope')
  const controller = new AccountsController(
    { findOneForWorkspace } as unknown as AccountsService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    } as unknown as WorkspaceContextService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    (options.absent ? undefined : { personPathsFor }) as unknown as MarketMemoryService | undefined,
    undefined,
    undefined,
    { scopeFor } as never,
  )
  return { controller, personPathsFor, findOneForWorkspace }
}

describe('GET /accounts/:id/market-paths', () => {
  it('rend les parcours du compte sans aucun identifiant, conformes au contrat strict', async () => {
    const { controller, personPathsFor } = build({ paths: [PATH] })
    const out = await controller.marketPaths(ID, USER)
    expect(personPathsFor).toHaveBeenCalledWith([expect.objectContaining({ ref: ID, name: 'THALES' })], {
      workspaceId: 'ws-1',
    })
    expect(accountMarketPathsSchema.parse(out)).toEqual(out)
    expect(out).toEqual({
      paths_total: 1,
      paths: [
        {
          job_title: 'Data Engineer',
          role_family: 'Data',
          skills: ['Kafka'],
          start_date: '2023-01-01',
          end_date: null,
          date_precision: 'month',
          work_status: 'freelance',
          esn_name: 'Alten',
          daily_rate_eur: 650,
        },
      ],
    })
    const keys = Object.keys(out.paths[0] ?? {})
    expect(
      keys.filter(
        key =>
          /(^|_)(name|first|last|email|mail|phone|gender|photo|url|linkedin|address|birth|key|id)(_|$)/.test(key) &&
          key !== 'esn_name',
      ),
    ).toEqual([])
    expect(JSON.stringify(out)).not.toContain('row-secret-1')
  })

  it('plafonne la liste et dit le total réel', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ ...PATH, id: `r${i}` }))
    const out = await build({ paths: many }).controller.marketPaths(ID, USER)
    expect(out.paths).toHaveLength(200)
    expect(out.paths_total).toBe(250)
  })

  it('compte hors espace / périmètre BU ⇒ 404, aucune lecture de la mémoire', async () => {
    const { controller, personPathsFor, findOneForWorkspace } = build({ missing: true })
    await expect(controller.marketPaths(ID, USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(findOneForWorkspace).toHaveBeenCalledWith(ID, 'ws-1', 'bu-scope')
    expect(personPathsFor).not.toHaveBeenCalled()
  })

  it('mémoire absente ou en panne ⇒ 503, jamais une liste vide inventée', async () => {
    await expect(build({ absent: true }).controller.marketPaths(ID, USER)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    await expect(build({ unavailable: true }).controller.marketPaths(ID, USER)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })
})
