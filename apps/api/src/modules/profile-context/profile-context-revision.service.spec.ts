import type { ProfileContext } from '@bellum/contracts'
import { assertSuccess, isFailure } from '@bellum/utils'
import type { DataSource, Repository } from 'typeorm'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { ProfileContextRevisionEntity } from '../../database/entities/profile-context-revision.entity'
import { ProfileContextRevisionService } from './profile-context-revision.service'

const CONTEXT = { esnArchetype: 'boutiqueExpert', sellingPosture: 'expertiseRare' } as unknown as ProfileContext

function makeRevision(over: Partial<ProfileContextRevisionEntity>): ProfileContextRevisionEntity {
  return {
    id: over.id ?? 'rev',
    user_id: over.user_id ?? 'u1',
    version: over.version ?? 1,
    schema_version: over.schema_version ?? 1,
    profile_context: over.profile_context ?? CONTEXT,
    created_at: over.created_at ?? new Date('2026-06-10T10:00:00.000Z'),
  }
}

function makeRevisionRepo(rows: ProfileContextRevisionEntity[]) {
  return {
    find: jest.fn(async ({ where }: { where: { user_id: string } }) =>
      rows.filter(r => r.user_id === where.user_id).sort((a, b) => b.version - a.version),
    ),
    findOne: jest.fn(
      async ({ where }: { where: { user_id: string; version: number } }) =>
        rows.find(r => r.user_id === where.user_id && r.version === where.version) ?? null,
    ),
  } as unknown as Repository<ProfileContextRevisionEntity>
}

function makeDataSource(currentVersion: number, saved: ProfileContextRevisionEntity[]) {
  const em = {
    findOne: jest.fn(async () => ({ profile_context_version: currentVersion })),
    update: jest.fn(async () => undefined),
    create: jest.fn((_entity: unknown, data: Partial<ProfileContextRevisionEntity>) => ({ ...data })),
    save: jest.fn(async (entity: ProfileContextRevisionEntity) => {
      const row = makeRevision({ ...entity, id: `rev-${entity.version}` })
      saved.push(row)
      return row
    }),
  }
  return { transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) => cb(em)) } as unknown as DataSource
}

/**
 * #2010.17 — `profiles.last_validated_context_version`, lu best-effort par
 * `ProfileContextRevisionService` pour marquer `was_last_validated` sur la
 * bonne révision. `null` par défaut : la plupart des tests de ce fichier ne
 * portent sur rien de validé.
 */
function makeProfilesRepo(lastValidatedVersion: number | null = null) {
  return {
    findOne: jest.fn(async () => ({ last_validated_context_version: lastValidatedVersion })),
  } as unknown as Repository<ProfileEntity>
}

describe('ProfileContextRevisionService', () => {
  it('lists revisions as metadata-only summaries, newest first', async () => {
    const rows = [makeRevision({ version: 1 }), makeRevision({ version: 2 })]
    const service = new ProfileContextRevisionService(makeRevisionRepo(rows), makeDataSource(2, []), makeProfilesRepo())

    const summaries = await service.list('u1')

    expect(summaries.map(s => s.version)).toEqual([2, 1])
    expect(summaries[0]).not.toHaveProperty('profile_context')
  })

  it('fails with revision_not_found when fetching an unknown version', async () => {
    const service = new ProfileContextRevisionService(makeRevisionRepo([]), makeDataSource(0, []), makeProfilesRepo())

    const result = await service.get('u1', 99)

    expect(isFailure(result) && result.problem.code).toBe('revision_not_found')
  })

  it('records a new version at currentVersion + 1', async () => {
    const saved: ProfileContextRevisionEntity[] = []
    const service = new ProfileContextRevisionService(
      makeRevisionRepo([]),
      makeDataSource(3, saved),
      makeProfilesRepo(),
    )

    await service.recordNewVersion('u1', CONTEXT)

    expect(saved[0]?.version).toBe(4)
  })

  it('restores a past revision as a new version, preserving its schema_version', async () => {
    const rows = [makeRevision({ version: 1, schema_version: 1 })]
    const saved: ProfileContextRevisionEntity[] = []
    const service = new ProfileContextRevisionService(
      makeRevisionRepo(rows),
      makeDataSource(2, saved),
      makeProfilesRepo(),
    )

    const restored = assertSuccess(await service.restore('u1', 1))

    expect(restored.version).toBe(3)
    expect(restored.schema_version).toBe(1)
  })

  it('fails to restore an unknown version', async () => {
    const service = new ProfileContextRevisionService(makeRevisionRepo([]), makeDataSource(0, []), makeProfilesRepo())

    const result = await service.restore('u1', 7)

    expect(isFailure(result)).toBe(true)
  })

  /**
   * #2010.17 — RÉSIDU : « laquelle des révisions passées était la dernière
   * validée » ne se dérive PAS de la position (#2010.6 ne dérive que
   * « actuelle vs remplacée ») — elle vient de
   * `profiles.last_validated_context_version`, stampé au clic « Valider ».
   */
  describe('was_last_validated (#2010.17)', () => {
    it('marque UNE SEULE révision — celle dont le numéro correspond à la dernière validée', async () => {
      const rows = [makeRevision({ version: 1 }), makeRevision({ version: 2 }), makeRevision({ version: 3 })]
      const service = new ProfileContextRevisionService(
        makeRevisionRepo(rows),
        makeDataSource(3, []),
        makeProfilesRepo(2),
      )

      const summaries = await service.list('u1')

      expect(summaries.find(s => s.version === 2)?.was_last_validated).toBe(true)
      expect(summaries.filter(s => s.was_last_validated)).toHaveLength(1)
    })

    it('ne marque rien quand rien n’a jamais été validé — jamais deviné', async () => {
      const rows = [makeRevision({ version: 1 }), makeRevision({ version: 2 })]
      const service = new ProfileContextRevisionService(
        makeRevisionRepo(rows),
        makeDataSource(2, []),
        makeProfilesRepo(null),
      )

      const summaries = await service.list('u1')

      expect(summaries.every(s => !s.was_last_validated)).toBe(true)
    })

    it('la révision courante peut AUSSI être la dernière validée (rien à régénérer depuis)', async () => {
      const rows = [makeRevision({ version: 1 })]
      const service = new ProfileContextRevisionService(
        makeRevisionRepo(rows),
        makeDataSource(1, []),
        makeProfilesRepo(1),
      )

      const summaries = await service.list('u1')

      expect(summaries[0]?.was_last_validated).toBe(true)
    })

    it('get() porte aussi le champ, pour la même révision demandée par numéro', async () => {
      const rows = [makeRevision({ version: 5 })]
      const service = new ProfileContextRevisionService(
        makeRevisionRepo(rows),
        makeDataSource(5, []),
        makeProfilesRepo(5),
      )

      const revision = assertSuccess(await service.get('u1', 5))

      expect(revision.was_last_validated).toBe(true)
    })
  })
})
