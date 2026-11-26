import type { Repository } from 'typeorm'
import { IMPORT_CHECKPOINT_ROWS } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'
import type { ImportWriteOutcome } from './import.service'

/**
 * L'écrivain de lignes s'ARRÊTE proprement, et pose son point de reprise en
 * chemin.
 *
 * Le service, lui, décide quoi en faire (`import-resume.spec.ts`). Ici on
 * vérifie les trois choses que SEUL l'écrivain sait faire :
 *  · reprendre à l'index demandé sans relire les lignes précédentes ;
 *  · classer l'échec avec `dispatchFailureOutcome` plutôt que de tout jeter ;
 *  · appeler le point de contrôle PENDANT la boucle, tous les
 *    `IMPORT_CHECKPOINT_ROWS`.
 */

const WS = 'ws-1'

function makeWriter(failOnSave: { at: number; error: unknown } | null) {
  let saves = 0
  const accounts = {
    find: jest.fn(async () => []),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      saves += 1
      if (failOnSave && saves === failOnSave.at) throw failOnSave.error
      return { ...value, id: `a-${saves}` }
    }),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<AccountEntity>
  const contacts = {
    find: jest.fn(async () => []),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 'c-1' })),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<ContactEntity>
  const projects = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 'p-1' })),
    update: jest.fn(async () => undefined),
    createQueryBuilder: jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    })),
  } as unknown as Repository<ProjectEntity>
  return new ImportWriterService(
    accounts,
    contacts,
    projects,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
  )
}

const rowsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ company: `Acme ${i}` }))

describe('l’écrivain de lignes s’arrête proprement', () => {
  it('rend ce qui a été écrit AU LIEU de jeter', async () => {
    // Une exception qui remonte perd les compteurs, l'instantané, et le fait
    // même que des lignes soient en base. C'est ce qui se passait.
    const writer = makeWriter({ at: 5, error: Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }) })
    const outcome = await writer.writeAccounts({ workspaceId: WS, userId: 'u-1', rows: rowsOf(10), startAt: 0 })

    expect(outcome.failure).toMatchObject({ row: 4, outcome: 'failed' })
    expect(outcome.processedRows).toBe(4)
    expect(outcome.created).toBe(4)
    expect(outcome.snapshot).toHaveLength(4)
  })

  it('classe une requête PARTIE sans réponse en `unknown`', async () => {
    const writer = makeWriter({ at: 3, error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) })
    const outcome = await writer.writeAccounts({ workspaceId: WS, userId: 'u-1', rows: rowsOf(10), startAt: 0 })
    expect(outcome.failure?.outcome).toBe('unknown')
  })

  it('reprend à l’index demandé, sans réécrire ce qui précède', async () => {
    const writer = makeWriter(null)
    const outcome = await writer.writeAccounts({ workspaceId: WS, userId: 'u-1', rows: rowsOf(10), startAt: 6 })
    expect(outcome.created).toBe(4)
    expect(outcome.processedRows).toBe(10)
  })

  it('appelle le point de contrôle PENDANT la boucle, pas seulement à la fin', async () => {
    // Un point de reprise posé uniquement à la fin ne survit à rien : c'est
    // précisément la fin qui n'arrive pas.
    const writer = makeWriter(null)
    const seen: number[] = []
    await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: rowsOf(IMPORT_CHECKPOINT_ROWS * 2 + 1),
      startAt: 0,
      checkpoint: async (progress: ImportWriteOutcome) => {
        seen.push(progress.processedRows)
      },
    })
    expect(seen).toEqual([IMPORT_CHECKPOINT_ROWS, IMPORT_CHECKPOINT_ROWS * 2])
  })

  it('compte le point de contrôle à partir du point de REPRISE', async () => {
    // Sinon une reprise à la ligne 4 000 n'écrirait son premier point qu'à la
    // 4 200e du fichier, et un second plantage rejouerait 200 lignes de plus.
    const writer = makeWriter(null)
    const seen: number[] = []
    await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: rowsOf(IMPORT_CHECKPOINT_ROWS + 50),
      startAt: 10,
      checkpoint: async (progress: ImportWriteOutcome) => {
        seen.push(progress.processedRows)
      },
    })
    expect(seen).toEqual([10 + IMPORT_CHECKPOINT_ROWS])
  })

  it('une ligne sans société AVANCE quand même le point de reprise', async () => {
    // Elle n'écrit rien, mais elle est LUE. Ne pas l'avancer ferait recommencer
    // la reprise sur elle indéfiniment.
    const writer = makeWriter(null)
    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: '' }, { company: '' }, { company: 'Acme' }],
      startAt: 0,
    })
    expect(outcome.processedRows).toBe(3)
    expect(outcome.created).toBe(1)
  })
})
