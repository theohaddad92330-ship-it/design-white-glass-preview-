import { CopilotMissionsEndedController } from './copilot-missions-ended.controller'

// #4065.9 — « les missions terminées ce trimestre » : la période PASSÉE, que `missions/ending` ne lit pas.
const USER = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-17T12:00:00Z')

const mission = (id: string, ends_on: string | null, over: Record<string, unknown> = {}) => ({
  id,
  label: `Mission ${id}`,
  accountName: 'ACME',
  started_on: '2026-01-01',
  ends_on,
  assignees: [{ id: 'c1', fullName: 'Ana Lima', photoUrl: 'x' }],
  marginPercent: 12,
  ...over,
})

function build(missions: unknown[]) {
  const delivery = { list: jest.fn().mockResolvedValue({ missions }) }
  return { controller: new CopilotMissionsEndedController(delivery as never, () => NOW), delivery }
}

describe('CopilotMissionsEndedController — #4065.9', () => {
  it('rend les missions TERMINÉES dans la fenêtre passée, la plus récente d’abord — sans marge ni photo', async () => {
    const { controller, delivery } = build([
      mission('a', '2026-08-01'),
      mission('b', '2026-09-30'),
      mission('old', '2025-01-01'),
    ])
    const out = await controller.ended({ userId: USER, endedSinceDays: 120 })
    expect(delivery.list).toHaveBeenCalledWith(USER, { canReadFinance: false })
    expect(out.missions.map(m => m.id)).toEqual(['b', 'a'])
    // La colonne est `started_on` (MissionEntity) ; la clé rendue au copilote reste `starts_on`.
    expect(out.missions[0]?.starts_on).toBe('2026-01-01')
    expect(JSON.stringify(out)).not.toMatch(/marginPercent|photoUrl/)
  })

  it('sait dire NON : ni mission en cours, ni mission sans date de fin n’est « terminée »', async () => {
    const { controller } = build([mission('f', '2026-12-01'), mission('n', null), mission('today', '2026-10-17')])
    expect((await controller.ended({ userId: USER, endedSinceDays: 365 })).missions).toEqual([])
  })
})
