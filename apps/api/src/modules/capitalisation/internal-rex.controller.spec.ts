import type { Repository } from 'typeorm'
import { InternalRexController } from './internal-rex.controller'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { RexEntryEntity } from '../../database/entities/rex-entry.entity'

/** #3544.4 — le diagnostic des REX dupliqués, lecture seule. */
const WS = '11111111-1111-4111-8111-111111111111'

function rex(over: Partial<RexEntryEntity>): RexEntryEntity {
  return {
    id: 'r?',
    workspace_id: WS,
    mission_id: 'm?',
    summary: 'Mission tenue dans les délais',
    what_worked: 'binôme',
    what_failed: 'reprise du legacy',
    collected_by: null,
    collected_at: new Date('2026-10-01T10:00:00.000Z'),
    ...over,
  } as RexEntryEntity
}

function make(rows: RexEntryEntity[], profiles: Partial<ProfileEntity>[] = []) {
  const find = jest.fn().mockResolvedValue(rows)
  const controller = new InternalRexController(
    { find } as unknown as Repository<RexEntryEntity>,
    {
      find: jest.fn().mockResolvedValue(rows.map(r => ({ id: r.mission_id, label: `Mission ${r.mission_id}` }))),
    } as unknown as Repository<MissionEntity>,
    { find: jest.fn().mockResolvedValue(profiles) } as unknown as Repository<ProfileEntity>,
  )
  return { controller, find }
}

describe('InternalRexController (#3544.4)', () => {
  it('deux REX au texte identique dans un espace : chacun porte « 1 autre »', async () => {
    const { controller } = make([rex({ id: 'a', mission_id: 'm1' }), rex({ id: 'b', mission_id: 'm2' })])
    const out = await controller.list(WS)
    expect(out.map(r => r.identicalTextCount)).toEqual([1, 1])
  })

  it('SAIT DIRE NON : deux REX différents, aucun marqueur', async () => {
    const { controller } = make([
      rex({ id: 'a', mission_id: 'm1' }),
      rex({ id: 'b', mission_id: 'm2', what_failed: 'rien à signaler' }),
    ])
    const out = await controller.list(WS)
    expect(out.map(r => r.identicalTextCount)).toEqual([0, 0])
  })

  it('le même texte dans deux ESPACES différents n’est pas un doublon', async () => {
    const { controller } = make([
      rex({ id: 'a', mission_id: 'm1' }),
      rex({ id: 'b', mission_id: 'm2', workspace_id: '22222222-2222-4222-8222-222222222222' }),
    ])
    expect((await controller.list()).map(r => r.identicalTextCount)).toEqual([0, 0])
  })

  it('casse et espaces ne font pas un texte différent', async () => {
    const { controller } = make([
      rex({ id: 'a', mission_id: 'm1' }),
      rex({ id: 'b', mission_id: 'm2', summary: '  mission  TENUE dans les délais ' }),
    ])
    expect((await controller.list(WS)).map(r => r.identicalTextCount)).toEqual([1, 1])
  })

  it('auteur : profil connu rendu, NULL ou id sans profil → null (jamais inventé)', async () => {
    const { controller } = make(
      [
        rex({ id: 'a', mission_id: 'm1', collected_by: 'u1' }),
        rex({ id: 'b', mission_id: 'm2', collected_by: null, summary: 'x' }),
        rex({ id: 'c', mission_id: 'm3', collected_by: 'u-inconnu', summary: 'y' }),
      ],
      [{ user_id: 'u1', first_name: 'Sarah', last_name: 'Roy', email: 's@x.fr' }],
    )
    const out = await controller.list(WS)
    expect(out[0].collectedBy).toEqual({ userId: 'u1', firstName: 'Sarah', lastName: 'Roy', email: 's@x.fr' })
    expect(out[1].collectedBy).toBeNull()
    expect(out[2].collectedBy).toBeNull()
    expect(out[0].missionLabel).toBe('Mission m1')
  })

  it('filtre par espace, lecture seule, liste vide sans erreur', async () => {
    const { controller, find } = make([])
    expect(await controller.list(WS)).toEqual([])
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: WS } }))
  })
})
