import { DealStageSlaService } from './deal-stage-sla.service'

/**
 * LE SLA D'ÉTAPE, RÉGLABLE PAR ESPACE — PDF 3 §3.5, `BEL-CRM-203` PR5.
 *
 * Le CALCUL est tenu par `deal-stage-sla.test.ts` (contrats, pur). Ici, le
 * chemin de RÉGLAGE : ce qu'un espace peut poser, ce qu'il ne peut pas, et ce
 * qui se passe quand on ne sait pas lire.
 */
describe('DealStageSlaService', () => {
  function build(rows: Array<{ stage: string; sla_days: number }> = [], failing = false) {
    const find = jest.fn(async () => {
      if (failing) throw new Error('boom')
      return rows.map(row => ({ workspace_id: 'w-1', ...row, updated_at: new Date() }))
    })
    const del = jest.fn().mockResolvedValue(undefined)
    const query = jest.fn().mockResolvedValue([])
    const repo = { find, delete: del, manager: { query } }
    return { service: new DealStageSlaService(repo as never), find, del, query }
  }

  it('sans réglage, les quatre défauts de la source — 7 / 14 / 7 / 21', async () => {
    const { service } = build()
    const rows = await service.effectiveFor('w-1')

    expect(rows.find(row => row.stage === 'qualified')).toEqual({ stage: 'qualified', slaDays: 7, isDefault: true })
    expect(rows.find(row => row.stage === 'confirmed')?.slaDays).toBe(14)
    expect(rows.find(row => row.stage === 'profiles_submitted')?.slaDays).toBe(7)
    expect(rows.find(row => row.stage === 'negotiation')?.slaDays).toBe(21)
    expect(rows.find(row => row.stage === 'won')?.slaDays).toBeNull()
  })

  it('un réglage d’espace l’emporte, et l’écran sait que ce n’est plus le défaut', async () => {
    const { service } = build([{ stage: 'negotiation', sla_days: 30 }])
    const rows = await service.effectiveFor('w-1')

    expect(rows.find(row => row.stage === 'negotiation')).toEqual({
      stage: 'negotiation',
      slaDays: 30,
      isDefault: false,
    })
    // Les autres restent au défaut : régler une étape n'en règle pas cinq.
    expect(rows.find(row => row.stage === 'qualified')?.isDefault).toBe(true)
  })

  it('borne toute lecture à l’espace', async () => {
    const { service, find } = build()
    await service.effectiveFor('w-1')
    expect(find).toHaveBeenCalledWith({ where: { workspace_id: 'w-1' } })
  })

  it('une lecture ratée retombe sur les DÉFAUTS, jamais sur « aucun seuil »', async () => {
    // Le côté prudent de l'erreur : un seuil manquant ferait taire le signal
    // sans que personne le voie.
    const { service } = build([], true)
    const rows = await service.effectiveFor('w-1')
    expect(rows.find(row => row.stage === 'qualified')?.slaDays).toBe(7)
  })

  it('écrit un réglage, et le remet à jour au second passage', async () => {
    const { service, query } = build()
    await service.setStageSla('w-1', 'qualified', 12)

    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('ON CONFLICT (workspace_id, stage) DO UPDATE')
    expect(params).toEqual(['w-1', 'qualified', 12])
  })

  it('`null` REMET le défaut — il ne pose pas un zéro', async () => {
    const { service, del, query } = build()
    await service.setStageSla('w-1', 'qualified', null)

    expect(del).toHaveBeenCalledWith({ workspace_id: 'w-1', stage: 'qualified' })
    expect(query).not.toHaveBeenCalled()
  })

  it('refuse une étape inconnue — jamais une ligne devinée', async () => {
    const { service } = build()
    await expect(service.setStageSla('w-1', 'qualifying', 7)).rejects.toThrow(/Étape inconnue/)
  })

  it('refuse de régler une étape GAGNÉE — une affaire signée ne vieillit pas', async () => {
    const { service } = build()
    await expect(service.setStageSla('w-1', 'won', 7)).rejects.toThrow(/gagnée ne vieillit pas/)
  })

  it('refuse une durée hors bornes, plutôt que de la tronquer en silence', async () => {
    const { service, query } = build()
    for (const absurd of [0, -1, 366]) {
      await expect(service.setStageSla('w-1', 'qualified', absurd)).rejects.toThrow(/entre 1 et 365/)
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('un deal sans date d’entrée est NON MESURÉ — jamais « à 0 jour, à l’heure »', async () => {
    const { service } = build()
    const aging = await service.agingOf('w-1', 'negotiation', null, new Date('2026-09-01T00:00:00.000Z'))

    expect(aging.days).toBeNull()
    expect(aging.overdue).toBeNull()
    expect(aging.slaDays).toBe(21)
  })

  it('mesure l’âge d’étape contre le réglage de l’espace, pas contre le défaut', async () => {
    const { service } = build([{ stage: 'qualified', sla_days: 30 }])
    const aging = await service.agingOf(
      'w-1',
      'qualified',
      '2026-08-20T00:00:00.000Z',
      new Date('2026-09-01T00:00:00.000Z'),
    )

    expect(aging.days).toBe(12)
    expect(aging.slaDays).toBe(30)
    expect(aging.overdue).toBe(false)
  })
})
