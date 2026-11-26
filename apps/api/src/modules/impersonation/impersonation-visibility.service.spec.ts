import type { Repository } from 'typeorm'
import type { ImpersonationAuditEntity } from '../../database/entities/impersonation-audit.entity'
import { ImpersonationVisibilityService } from './impersonation-visibility.service'

/** Le query builder réduit à ce que le service en appelle, en enregistrant le SQL. */
function build(row: { since: Date | string | null; until: Date | string | null } | undefined) {
  const clauses: string[] = []
  const params: Record<string, unknown> = {}
  const qb: Record<string, unknown> = {}
  const chain = (nom: string) =>
    jest.fn((sql?: unknown, p?: Record<string, unknown>) => {
      if (typeof sql === 'string') clauses.push(`${nom}:${sql}`)
      if (p) Object.assign(params, p)
      return qb
    })
  Object.assign(qb, {
    select: chain('select'),
    where: chain('where'),
    andWhere: chain('andWhere'),
    orderBy: chain('orderBy'),
    limit: chain('limit'),
    getRawOne: jest.fn(async () => row),
  })
  const audit = { createQueryBuilder: jest.fn(() => qb) } as unknown as Repository<ImpersonationAuditEntity>
  return { service: new ImpersonationVisibilityService(audit), clauses, params }
}

describe('ImpersonationVisibilityService (#1670.2)', () => {
  it('dit qu’une incarnation est en cours, avec ses deux dates', async () => {
    const since = new Date('2026-09-06T10:00:00Z')
    const until = new Date('2026-09-06T10:15:00Z')
    const { service } = build({ since, until })

    await expect(service.forUser('moi')).resolves.toEqual({
      active: true,
      since: '2026-09-06T10:00:00.000Z',
      until: '2026-09-06T10:15:00.000Z',
    })
  })

  it('ne dit RIEN d’autre — ni qui est incarné, ni qui incarne', async () => {
    const { service } = build({ since: new Date(), until: new Date() })
    const vu = await service.forUser('moi')
    // Le contrat entier tient en trois clés. Une quatrième serait une fuite :
    // « quelqu'un est connecté en tant que Sarah » dit à toute l'équipe de Sarah
    // quelque chose que #1670 ne demande pas de dire.
    expect(Object.keys(vu).sort()).toEqual(['active', 'since', 'until'])
  })

  it('sur aucune session, ne renvoie AUCUNE date', async () => {
    const { service } = build(undefined)
    // « Pas de session » n'est pas « session commencée à l'époque Unix ».
    await expect(service.forUser('moi')).resolves.toEqual({ active: false, since: null, until: null })
  })

  it('exige les DEUX conditions de fin : le jeton vivant ET aucun stop', async () => {
    const { service, clauses } = build(undefined)
    await service.forUser('moi')
    const sql = clauses.join('\n')
    // L'expiration seule laisserait le bandeau allumé 15 min après une sortie ;
    // le stop seul le laisserait allumé pour toujours si l'onglet est fermé.
    expect(sql).toMatch(/expires_at > now\(\)/)
    expect(sql).toMatch(/NOT EXISTS/)
    expect(sql).toMatch(/fin\.action = 'stop'/)
  })

  it('ne regarde QUE les membres de mes espaces', async () => {
    const { service, clauses, params } = build(undefined)
    await service.forUser('moi-123')
    const sql = clauses.join('\n')
    // Sans ce cloisonnement, le bandeau s'allumerait chez tout le monde dès
    // qu'une incarnation existe n'importe où — la fuite d'information la plus
    // bête possible.
    expect(sql).toMatch(/workspace_members/)
    expect(sql).toMatch(/moi\.user_id = :userId/)
    expect(params['userId']).toBe('moi-123')
  })
})
