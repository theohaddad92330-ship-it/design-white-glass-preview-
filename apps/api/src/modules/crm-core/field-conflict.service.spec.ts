import { FieldConflictService } from './field-conflict.service'

/**
 * Ce que le service ajoute à la fonction pure : il RETROUVE la provenance de la
 * valeur écartée, que le journal ne porte pas sur la même ligne.
 *
 * La règle d'arbitrage (humain > autorité > non tranché) est testée dans
 * `packages/contracts/src/schemas/field-conflict.test.ts`.
 */

type Row = Record<string, unknown>

function service(rows: Row[]): { svc: FieldConflictService; query: jest.Mock } {
  const query = jest.fn().mockResolvedValue(rows)
  return { svc: new FieldConflictService({ manager: { query } } as never), query }
}

/** L'exemple du §5.3 : le registre dit 4 200, le site officiel dit 5 000. */
function row(over: Row = {}): Row {
  return {
    field: 'headcount',
    old_value: '4200',
    new_value: '5000',
    source: 'pipeline',
    created_at: '2026-08-18T09:00:00.000Z',
    previous_source: 'pipeline',
    previous_at: '2026-08-14T09:00:00.000Z',
    ...over,
  }
}

describe('FieldConflictService — sources abandonnées (#190.2, lot E1 30/09)', () => {
  it('une source muette depuis un an cède à une source vivante : `obsolete_source`, rendue avec includeSettled', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([row({ previous_source: 'model', source: 'pipeline' })])
      .mockResolvedValueOnce([
        { source: 'model', last_at: '2025-06-01T09:00:00.000Z' },
        { source: 'pipeline', last_at: '2026-08-18T09:00:00.000Z' },
      ])
    const svc = new FieldConflictService({ manager: { query } } as never)
    const all = await svc.openConflicts('w1', 'account', 'a1', { includeSettled: true })
    expect(all.map(c => c.resolvedBy)).toEqual(['obsolete_source'])
  })

  it('sait dire NON : sans includeSettled, un conflit tranché ne se montre pas', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([row({ previous_source: 'model', source: 'pipeline' })])
      .mockResolvedValueOnce([
        { source: 'model', last_at: '2025-06-01T09:00:00.000Z' },
        { source: 'pipeline', last_at: '2026-08-18T09:00:00.000Z' },
      ])
    const svc = new FieldConflictService({ manager: { query } } as never)
    expect(await svc.openConflicts('w1', 'account', 'a1')).toEqual([])
  })

  it('sait dire NON : une fiche sans autre écriture récente ne rend personne obsolète', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([{ source: 'pipeline', last_at: '2026-08-18T09:00:00.000Z' }])
    const svc = new FieldConflictService({ manager: { query } } as never)
    const open = await svc.openConflicts('w1', 'account', 'a1')
    expect(open[0]?.resolvedBy).toBe('unresolved')
    expect(open[0]?.nextCheck).toBe('2026-09-01T09:00:00.000Z')
  })
})

describe('FieldConflictService — ce que l’écriture a tu', () => {
  it('lit le journal de la fiche demandée, dans son espace', async () => {
    const { svc, query } = service([])
    await svc.openConflicts('w1', 'account', 'a1')
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('record_field_audit')
    expect(sql).toContain('workspace_id = $1')
    expect(params).toEqual(['w1', 'account', 'a1'])
  })

  it('MONTRE deux sources automatiques de même autorité qui se contredisent', async () => {
    const { svc } = service([row()])
    const conflicts = await svc.openConflicts('w1', 'account', 'a1')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.resolvedBy).toBe('unresolved')
    // La valeur ÉCARTÉE garde sa date — c'est l'archive, pas une suppression.
    expect(conflicts[0]?.valueA).toEqual({
      value: '4200',
      source: 'pipeline',
      at: '2026-08-14T09:00:00.000Z',
      authority: 2,
    })
    expect(conflicts[0]?.valueB).toEqual({
      value: '5000',
      source: 'pipeline',
      at: '2026-08-18T09:00:00.000Z',
      authority: 2,
    })
  })

  // #190.1 — l'entité concernée voyage avec chaque contradiction : le détecteur
  // pur ne la connaît pas, c'est ce service qui l'attache (`entityType`/`entityId`
  // sont ses propres paramètres d'appel).
  it('attache l’entité concernée à chaque contradiction ouverte (#190.1)', async () => {
    const { svc } = service([row()])
    const conflicts = await svc.openConflicts('w1', 'contact', 'c42')
    expect(conflicts[0]?.entity).toEqual({ type: 'contact', id: 'c42' })
  })

  it('NE MONTRE PAS un conflit qu’un humain a tranché', async () => {
    // La correction humaine EST la décision : la re-poser à l'écran ferait
    // redemander à quelqu'un ce qu'il vient de dire.
    const { svc } = service([row({ source: 'human' })])
    expect(await svc.openConflicts('w1', 'account', 'a1')).toEqual([])
  })

  it('NE MONTRE PAS un conflit qu’un humain avait tranché AVANT, même s’il est plus ancien', async () => {
    // « Résolution par récence » ne veut pas dire que le plus récent gagne : le
    // pipeline tourne toutes les nuits, l'humain une fois par mois.
    const { svc } = service([row({ previous_source: 'human', previous_at: '2026-01-04T09:00:00.000Z' })])
    expect(await svc.openConflicts('w1', 'account', 'a1')).toEqual([])
  })

  it('NE MONTRE PAS un conflit que l’AUTORITÉ tranche — il reste au journal', async () => {
    // Un connecteur contre un pipeline : `decideFieldWrite` a déjà tranché,
    // le montrer ferait clignoter chaque nuit sans décision à prendre.
    const { svc } = service([row({ source: 'connector' })])
    expect(await svc.openConflicts('w1', 'account', 'a1')).toEqual([])
  })

  it('ÉCARTE une contradiction dont la valeur sortante n’est pas datable', async () => {
    // Première écriture d'un champ : la valeur d'avant est plus vieille que le
    // journal. « Le site dit 5 000, autre chose disait 4 200, on ne sait pas
    // quand » n'aide personne à trancher.
    const { svc } = service([row({ previous_at: null, previous_source: null })])
    expect(await svc.openConflicts('w1', 'account', 'a1')).toEqual([])
  })

  it('ne voit AUCUNE contradiction quand un blanc remplace une valeur', async () => {
    // Un fournisseur qui ne trouve rien n'est pas un fournisseur qui contredit.
    const { svc } = service([row({ new_value: null })])
    expect(await svc.openConflicts('w1', 'account', 'a1')).toEqual([])
  })

  it('ne voit AUCUNE contradiction quand la valeur n’a pas changé', async () => {
    const { svc } = service([row({ new_value: '4200' })])
    expect(await svc.openConflicts('w1', 'account', 'a1')).toEqual([])
  })

  it('classe la contradiction la plus récente en premier', async () => {
    const { svc } = service([
      row({ field: 'headcount' }),
      row({ field: 'revenue', created_at: '2026-08-25T09:00:00.000Z', previous_at: '2026-08-20T09:00:00.000Z' }),
    ])
    const conflicts = await svc.openConflicts('w1', 'account', 'a1')
    expect(conflicts.map(c => c.field)).toEqual(['revenue', 'headcount'])
  })
})

describe('FieldConflictService — portées déclarées (#190.2, lot X51 02/10)', () => {
  it('« 12 dans l’équipe Data » contre « 500 au total » : `scope_difference`, jamais montrée comme contradiction ouverte', async () => {
    const { svc, query } = service([
      row({ old_value: '12', new_value: '500', previous_scope: 'équipe Data', scope: 'groupe' }),
    ])
    expect(await svc.openConflicts('w1', 'account', 'a1')).toEqual([])
    // Le SQL lit bien la portée de l'écriture précédente (LAG) et de la récente.
    expect(String(query.mock.calls[0][0])).toContain('LAG(scope)')

    const { svc: settled } = service([
      row({ old_value: '12', new_value: '500', previous_scope: 'équipe Data', scope: 'groupe' }),
    ])
    const all = await settled.openConflicts('w1', 'account', 'a1', { includeSettled: true })
    expect(all.map(c => c.resolvedBy)).toEqual(['scope_difference'])
    expect(all[0].claims.map(c => c.scope)).toEqual(['équipe Data', 'groupe'])
  })

  it('le NON : sans portée déclarée (journal historique), la contradiction reste ouverte', async () => {
    const { svc } = service([row({ previous_scope: null, scope: null })])
    const conflicts = await svc.openConflicts('w1', 'account', 'a1')
    expect(conflicts.map(c => c.resolvedBy)).toEqual(['unresolved'])
  })
})
