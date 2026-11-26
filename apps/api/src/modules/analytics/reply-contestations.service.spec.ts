import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import { InternalReplyContestationsController } from './internal-reply-contestations.controller'
import { ReplyContestationsService } from './reply-contestations.service'

// #2442.10 (lot W9) — la lecture de l'agrégat : le plancher partagé, la fenêtre, la forme.
function build(rows: unknown[] | Error) {
  const query = jest.fn(async () => {
    if (rows instanceof Error) throw rows
    return rows
  })
  const service = new ReplyContestationsService({ manager: { query } } as never)
  return { service, query }
}

describe('ReplyContestationsService (#2442.10)', () => {
  it('passe le plancher PARTAGÉ (un seul endroit) et la fenêtre à la requête', async () => {
    const { service, query } = build([])
    const now = new Date('2026-10-11T00:00:00Z')
    await service.report(30, now)
    const [, params] = query.mock.calls[0] as unknown as [string, [Date, number]]
    expect(params[1]).toBe(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)
    expect(params[0].toISOString()).toBe('2026-09-11T00:00:00.000Z')
  })

  it('convertit les comptes SQL (texte) en nombres et rend la forme sans identité', async () => {
    const { service } = build([
      { tool: 'prepare_message', replies: '12', feedbacks: '20', contested: '5', corrected: '2' },
    ])
    const report = await service.report()
    expect(report.byTool).toEqual([
      { tool: 'prepare_message', replies: 12, feedbacks: 20, contested: 5, corrected: 2, contestedShare: 0.25 },
    ])
    expect(report.windowDays).toBe(90)
  })

  it('re-vérifie le plancher à la lecture : une ligne sous le seuil que le SQL aurait laissée passer ne sort pas', async () => {
    const { service } = build([{ tool: 'rare', replies: '2', feedbacks: '2', contested: '2', corrected: '0' }])
    const report = await service.report()
    expect(report.byTool).toEqual([])
    expect(report.withheldTools).toBe(1)
  })

  it('une fenêtre absurde retombe sur le défaut, plafonnée à un an', async () => {
    const { service } = build([])
    expect((await service.report(-3)).windowDays).toBe(90)
    expect((await service.report(9999)).windowDays).toBe(365)
  })

  it('le contrôleur lit `days` et délègue', async () => {
    const report = jest.fn().mockResolvedValue({ byTool: [] })
    const controller = new InternalReplyContestationsController({ report } as never)
    await controller.get('45')
    expect(report).toHaveBeenCalledWith(45)
    await controller.get()
    expect(report).toHaveBeenLastCalledWith(undefined)
  })
})
