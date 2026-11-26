import type { Repository } from 'typeorm'
import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { liveReservedTotal } from '../credits/credit-reservation.rules'
import { CreditReservationService } from './credit-reservation.service'

/**
 * Le registre des crédits PROMIS.
 *
 * Ce que ces tests prouvent n'est pas « les méthodes existent » : c'est qu'une
 * MÊME dépense ne peut pas être promise deux fois, ni gelée pour toujours.
 * Ils tournent donc contre un dépôt qui STOCKE réellement les lignes et qui
 * applique la contrainte de la base — un `jest.fn()` qui rend `{ affected: 1 }`
 * prouverait exactement rien.
 */

/** L'erreur que Postgres lève sur l'index unique partiel
 *  `credit_reservations_live_reference_idx`. */
class UniqueViolation extends Error {
  readonly code = '23505'
  constructor() {
    super('duplicate key value violates unique constraint "credit_reservations_live_reference_idx"')
  }
}

/**
 * Un dépôt en mémoire qui se comporte comme la table : il garde les lignes, il
 * filtre sur les mêmes colonnes, et il REFUSE une seconde ligne `reserved` pour
 * la même référence — la contrainte posée par la migration.
 */
function inMemoryReservations(options: { enforceUnique?: boolean } = {}) {
  const enforceUnique = options.enforceUnique ?? true
  const rows: CreditReservationEntity[] = []
  let sequence = 0

  const matches = (row: CreditReservationEntity, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && '_type' in (value as object)) {
        // `LessThan(date)` — la seule opération TypeORM utilisée ici.
        const operator = value as { _type: string; _value: unknown }
        return (
          new Date(row[key as keyof CreditReservationEntity] as never).getTime() <
          new Date(operator._value as string).getTime()
        )
      }
      return row[key as keyof CreditReservationEntity] === value
    })

  const repo = {
    rows,
    async findOne({ where }: { where: Record<string, unknown> }) {
      return rows.find(row => matches(row, where)) ?? null
    },
    async find({ where }: { where: Record<string, unknown> }) {
      return rows.filter(row => matches(row, where))
    },
    create(entity: Partial<CreditReservationEntity>) {
      return entity as CreditReservationEntity
    },
    async save(entity: CreditReservationEntity) {
      if (
        enforceUnique &&
        entity.state === 'reserved' &&
        rows.some(row => row.state === 'reserved' && row.reference === entity.reference)
      ) {
        throw new UniqueViolation()
      }
      const stored = { ...entity, id: entity.id ?? `res-${++sequence}` }
      rows.push(stored)
      return stored
    },
    async update(where: Record<string, unknown>, patch: Partial<CreditReservationEntity>) {
      let affected = 0
      for (const row of rows) {
        if (!matches(row, where)) continue
        Object.assign(row, patch)
        affected += 1
      }
      return { affected }
    },
  }
  return repo
}

type MemoryRepo = ReturnType<typeof inMemoryReservations>

function build(options: { enforceUnique?: boolean } = {}) {
  const repo = inMemoryReservations(options)
  const service = new CreditReservationService(repo as unknown as Repository<CreditReservationEntity>)
  return { service, repo }
}

const RESERVE = {
  workspaceId: 'ws-1',
  userId: 'u-1',
  kind: 'enrichment' as const,
  amount: 8,
  reference: 'corr-1',
}

/** Ce que le solde annoncé retiendra de la table — la même dérivation que la
 *  facturation applique (`liveReservedTotal`), lue ici sur les lignes réelles. */
const promised = (repo: MemoryRepo, now = new Date()): number => liveReservedTotal(repo.rows, now)

describe('CreditReservationService — une dépense ne se promet qu’une fois', () => {
  it('réserve le montant demandé', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    expect(repo.rows).toHaveLength(1)
    expect(promised(repo)).toBe(8)
  })

  it('RÉSERVER DEUX FOIS LA MÊME RÉFÉRENCE NE GÈLE PAS SEIZE CRÉDITS — un rejeu de file ne double pas la promesse', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    await service.reserve(RESERVE)
    expect(repo.rows.filter(row => row.state === 'reserved')).toHaveLength(1)
    expect(promised(repo)).toBe(8)
  })

  it('survit à la COURSE : deux appels simultanés passent la lecture, la base tranche, le total reste 8', async () => {
    // Le cas que `findOne` seul ne couvre pas : les deux appels lisent une table
    // vide AVANT que l'un des deux n'écrive. Sans l'index unique, deux lignes.
    // Avec lui, la seconde écriture est refusée — et le service doit rendre la
    // réservation existante plutôt que de propager une 500.
    const { service, repo } = build()
    const [first, second] = await Promise.all([service.reserve(RESERVE), service.reserve(RESERVE)])
    expect(repo.rows.filter(row => row.state === 'reserved')).toHaveLength(1)
    expect(first.reference).toBe('corr-1')
    expect(second.reference).toBe('corr-1')
    expect(promised(repo)).toBe(8)
  })

  it('deux références DIFFÉRENTES gèlent bien leurs deux montants', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    await service.reserve({ ...RESERVE, reference: 'corr-2', amount: 4 })
    expect(promised(repo)).toBe(12)
  })

  it('solder libère la promesse — le solde annoncé revient', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    await service.settle('ws-1', 'corr-1', 'consumed')
    expect(promised(repo)).toBe(0)
    expect(repo.rows[0]?.state).toBe('consumed')
    expect(repo.rows[0]?.settled_at).toBeInstanceOf(Date)
  })

  it('solder DEUX FOIS ne change pas l’issue — un rejeu n’est pas une anomalie', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    await service.settle('ws-1', 'corr-1', 'consumed')
    await service.settle('ws-1', 'corr-1', 'released')
    expect(repo.rows[0]?.state).toBe('consumed')
  })

  it('R4 — solder ne touche QUE la réservation de SON espace : la même référence ailleurs reste promise', async () => {
    // L'index unique est `(workspace_id, reference)` : deux espaces peuvent tenir une
    // réservation vivante sous la même référence. Un solde sans l'espace les soldait toutes.
    const { service, repo } = build()
    await service.reserve(RESERVE)
    repo.rows.push({ ...(repo.rows[0] as CreditReservationEntity), id: 'res-other-ws', workspace_id: 'ws-2' })
    await service.settle('ws-1', 'corr-1', 'consumed')
    expect(repo.rows.map(row => [row.workspace_id, row.state])).toEqual([
      ['ws-1', 'consumed'],
      ['ws-2', 'reserved'],
    ])
  })

  it('après un solde, la même référence peut être réservée à nouveau — un nouveau run n’est pas bloqué', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    await service.settle('ws-1', 'corr-1', 'released')
    await service.reserve(RESERVE)
    expect(repo.rows.filter(row => row.state === 'reserved')).toHaveLength(1)
    expect(promised(repo)).toBe(8)
  })
})

describe('CreditReservationService.sweepExpired — un run mort ne gèle pas la journée', () => {
  it('marque `expired` ce qui a dépassé son délai, et rend le compte', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    // Le process est tué : la réservation reste `reserved`, sa date passe.
    const row = repo.rows[0] as CreditReservationEntity
    row.expires_at = new Date(Date.now() - 1_000)

    expect(await service.sweepExpired('ws-1')).toBe(1)
    expect(repo.rows[0]?.state).toBe('expired')
    expect(promised(repo)).toBe(0)
  })

  it('ne touche PAS une réservation encore vivante — un run en cours garde sa promesse', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    expect(await service.sweepExpired('ws-1')).toBe(0)
    expect(repo.rows[0]?.state).toBe('reserved')
    expect(promised(repo)).toBe(8)
  })

  it('ne balaie que l’espace demandé — les concurrents ne se balaient pas entre eux', async () => {
    const { service, repo } = build()
    await service.reserve(RESERVE)
    await service.reserve({ ...RESERVE, workspaceId: 'ws-2', reference: 'corr-2' })
    for (const row of repo.rows) row.expires_at = new Date(Date.now() - 1_000)

    expect(await service.sweepExpired('ws-1')).toBe(1)
    expect(repo.rows.find(row => row.workspace_id === 'ws-2')?.state).toBe('reserved')
  })
})

describe('la contrainte de base est ce qui tient la promesse — preuve que la garde sait dire NON', () => {
  it('SANS l’index unique, la course crée bien deux lignes : la contrainte n’est pas décorative', async () => {
    // Ce test casse volontairement ce que le précédent protège. S'il tombait
    // (deux lignes impossibles même sans contrainte), c'est que le test de la
    // course ne prouvait rien — il aurait passé pour une autre raison.
    const { service, repo } = build({ enforceUnique: false })
    await Promise.all([service.reserve(RESERVE), service.reserve(RESERVE)])
    expect(repo.rows.filter(row => row.state === 'reserved')).toHaveLength(2)
    // Et la déduplication par référence est le second filet : même avec deux
    // lignes en base, le solde annoncé ne gèle pas seize crédits.
    expect(promised(repo)).toBe(8)
  })
})
