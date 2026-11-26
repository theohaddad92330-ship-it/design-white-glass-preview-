import { MissionDriftService } from './mission-drift.service'

/**
 * Ce que le service ajoute à la fonction pure : la LECTURE.
 *
 * La règle métier (deux signaux, trois mois, les cinq seuils) est testée dans
 * `packages/contracts/src/schemas/mission-drift.test.ts`. Ici on vérifie la
 * traduction base → mois normalisés, qui est l'endroit où un « 0 » se glisse.
 */

type Row = Record<string, unknown>

function service(rows: Row[]): MissionDriftService {
  const manager = { query: jest.fn().mockResolvedValue(rows) }
  return new MissionDriftService({ manager } as never)
}

function row(period: string, over: Row = {}): Row {
  return {
    mission_id: 'm1',
    mission_label: 'Data Engineer',
    account_name: 'Orange',
    ends_on: '2026-12-31',
    period_month: `${period}-01`,
    days: '20',
    expected_days: '20',
    status: 'validated',
    validated_by_client_at: null,
    ...over,
  }
}

describe('MissionDriftService — la lecture des relevés', () => {
  it('regroupe les relevés par mission et rend un verdict par mission', async () => {
    const reports = await service([
      row('2026-05'),
      row('2026-06'),
      row('2026-07'),
      row('2026-05', { mission_id: 'm2', mission_label: 'Architecte' }),
    ]).forWorkspace('w1')

    expect(reports).toHaveLength(2)
    expect(reports.map(r => r.missionId).sort()).toEqual(['m1', 'm2'])
    expect(reports.find(r => r.missionId === 'm1')?.verdict.months).toBe(3)
  })

  it('NE COMPTE PAS un mois sans relevé comme zéro jour déclaré', async () => {
    // `missing` / `expected` veulent dire « le CRA n'est pas arrivé ». Les lire
    // comme « 0 jour déclaré » produirait l'écart le plus négatif possible et
    // ferait crier à la dérive sur un simple retard de saisie.
    const reports = await service([
      row('2026-05', { status: 'missing', days: null }),
      row('2026-06', { status: 'expected', days: null }),
      row('2026-07', { status: 'missing', days: null }),
    ]).forWorkspace('w1')

    const verdict = reports[0]?.verdict
    expect(verdict?.unmeasurable).toContain('growing_day_gap')
    if (verdict?.kind === 'drifting') expect(verdict.signals).not.toContain('growing_day_gap')
  })

  it('NOMME les deux signaux que ce dépôt ne sait pas encore mesurer', async () => {
    // Aucune date de remise de CRA, aucune donnée de satisfaction : les deux
    // remontent « non mesurés », jamais « pas de dérive ».
    const reports = await service([row('2026-05'), row('2026-06'), row('2026-07')]).forWorkspace('w1')
    expect(reports[0]?.verdict.unmeasurable).toEqual(expect.arrayContaining(['late_timesheet', 'satisfaction_drop']))
  })

  it('mesure la lenteur de validation client depuis la CLÔTURE du mois', async () => {
    // Mai clôture le 1er juin ; validé le 11 juin = 10 jours.
    const reports = await service([
      row('2026-05', { validated_by_client_at: '2026-06-11T00:00:00.000Z' }),
      row('2026-06', { validated_by_client_at: '2026-07-21T00:00:00.000Z' }),
      row('2026-07', { validated_by_client_at: '2026-09-01T00:00:00.000Z' }),
    ]).forWorkspace('w1')

    const verdict = reports[0]?.verdict
    const firing = verdict?.kind === 'drifting' ? verdict.signals : verdict?.kind === 'steady' ? verdict.firing : []
    expect(firing).toContain('slow_client_validation')
  })

  it('voit la contestation de jours — une seule suffit', async () => {
    const reports = await service([
      row('2026-05'),
      row('2026-06'),
      row('2026-07', { status: 'disputed' }),
    ]).forWorkspace('w1')

    const verdict = reports[0]?.verdict
    const firing = verdict?.kind === 'drifting' ? verdict.signals : verdict?.kind === 'steady' ? verdict.firing : []
    expect(firing).toContain('disputed_days')
  })

  it('alerte sur deux signaux : écart négatif qui dure ET jours contestés', async () => {
    const reports = await service([
      row('2026-05', { days: '18' }),
      row('2026-06', { days: '16' }),
      row('2026-07', { days: '14', status: 'disputed' }),
    ]).forWorkspace('w1')

    expect(reports[0]?.verdict.kind).toBe('drifting')
  })

  it('rend AUSSI les missions qu’on ne sait pas lire — les cacher les effacerait', async () => {
    const reports = await service([row('2026-07')]).forWorkspace('w1')
    expect(reports[0]?.verdict.kind).toBe('unmeasurable')
  })

  it('ne lit que les missions EN COURS de l’espace demandé', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) }
    await new MissionDriftService({ manager } as never).forWorkspace('w1')
    const [sql, params] = manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('m.workspace_id = $1')
    expect(sql).toContain("m.status IN ('active', 'onboarding', 'paused')")
    expect(params).toEqual(['w1'])
  })

  it('classe les dérives d’abord, puis ce qu’on ignore, puis le reste', async () => {
    const reports = await service([
      // m1 : sain et lisible
      row('2026-05'),
      row('2026-06'),
      row('2026-07'),
      // m2 : illisible (un seul mois)
      row('2026-07', { mission_id: 'm2', mission_label: 'Illisible' }),
      // m3 : dérive
      row('2026-05', { mission_id: 'm3', mission_label: 'Dérive', days: '18' }),
      row('2026-06', { mission_id: 'm3', mission_label: 'Dérive', days: '16' }),
      row('2026-07', { mission_id: 'm3', mission_label: 'Dérive', days: '14', status: 'disputed' }),
    ]).forWorkspace('w1')

    expect(reports.map(r => r.verdict.kind)).toEqual(['drifting', 'unmeasurable', 'steady'])
  })
})
