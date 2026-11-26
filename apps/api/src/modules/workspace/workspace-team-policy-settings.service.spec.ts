import { BadRequestException } from '@nestjs/common'
import { EMPTY_TEAM_POLICY } from '@bellum/contracts'
import { WorkspaceTeamPolicySettingsService } from './workspace-team-policy-settings.service'

/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE : une ligne par espace, créée au premier
 * enregistrement ; aucune ligne = « aucune politique d'équipe saisie », jamais
 * une règle devinée.
 */
const WS = 'ws-1'
const USER = 'user-1'

function build(row: Record<string, unknown> | null, { failRead = false } = {}) {
  const query = jest.fn(async () => [])
  const repo = {
    findOne: jest.fn(async () => {
      if (failRead) throw new Error('db down')
      return row
    }),
    manager: { query },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- double de test
  const service = new WorkspaceTeamPolicySettingsService(repo as any)
  return { service, repo, query }
}

const ROW = {
  workspace_id: WS,
  prospecting_windows: [{ startMinute: 540, endMinute: 660 }],
  forbidden_windows: [{ startMinute: 720, endMinute: 840 }],
  max_meetings_per_day: 4,
  daily_call_target: 20,
}

describe('WorkspaceTeamPolicySettingsService (#2770.37)', () => {
  it('aucune ligne → la politique vide, jamais une règle devinée', async () => {
    const { service } = build(null)
    await expect(service.effectiveFor(WS)).resolves.toEqual(EMPTY_TEAM_POLICY)
  })

  it('lit la ligne de l’espace', async () => {
    const { service, repo } = build(ROW)
    await expect(service.effectiveFor(WS)).resolves.toEqual({
      prospectingWindows: [{ startMinute: 540, endMinute: 660 }],
      forbiddenWindows: [{ startMinute: 720, endMinute: 840 }],
      maxMeetingsPerDay: 4,
      dailyCallTarget: 20,
    })
    expect(repo.findOne).toHaveBeenCalledWith({ where: { workspace_id: WS } })
  })

  it('une plage illisible en base est écartée, jamais réinterprétée', async () => {
    const { service } = build({
      ...ROW,
      forbidden_windows: [{ startMinute: 'x' }, { startMinute: 60, endMinute: 120 }],
    })
    const policy = await service.effectiveFor(WS)
    expect(policy.forbiddenWindows).toEqual([{ startMinute: 60, endMinute: 120 }])
  })

  it('une lecture en panne retombe sur « rien saisi »', async () => {
    const { service } = build(ROW, { failRead: true })
    await expect(service.effectiveFor(WS)).resolves.toEqual(EMPTY_TEAM_POLICY)
  })

  it('pour Laura : `null` quand rien n’est saisi, la politique sinon', async () => {
    await expect(build(null).service.forLaura(WS)).resolves.toEqual({ policy: null })
    const { service } = build(ROW)
    await expect(service.forLaura(WS)).resolves.toEqual({ policy: expect.objectContaining({ dailyCallTarget: 20 }) })
  })

  it('PATCH : un champ omis ne bouge pas, la ligne est upsertée avec son auteur', async () => {
    const { service, query } = build(ROW)
    const out = await service.update(WS, USER, { dailyCallTarget: null })
    expect(out).toEqual({ ...(await service.effectiveFor(WS)), dailyCallTarget: null })
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('INSERT INTO workspace_team_policy_settings')
    expect(sql).toContain('ON CONFLICT (workspace_id) DO UPDATE')
    expect(params).toEqual([
      WS,
      JSON.stringify(ROW.prospecting_windows),
      JSON.stringify(ROW.forbidden_windows),
      4,
      null,
      USER,
    ])
  })

  it('PATCH : refuse une politique FUSIONNÉE contradictoire (plages qui se chevauchent)', async () => {
    const { service, query } = build(ROW)
    await expect(
      service.update(WS, USER, { forbiddenWindows: [{ startMinute: 600, endMinute: 700 }] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(query).not.toHaveBeenCalled()
  })
})
