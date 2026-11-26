import { NotFoundException } from '@nestjs/common'
import type { Repository, SelectQueryBuilder } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import { applyConsultantScope } from './consultant-scope'
import { CvStudioService } from './cv-studio.service'

/**
 * Finding pentest #2 (HAUTE, cloisonnement). CV Studio doit refuser une fiche
 * d'un AUTRE espace — y compris une fiche `workspace_id IS NULL` d'un autre
 * utilisateur, le cas exact que l'ancienne garde en ligne laissait passer.
 */
describe('CvStudioService — cloisonnement (finding #2)', () => {
  it('applyConsultantScope garde le NULL-espace pour son SEUL propriétaire', () => {
    const clauses: Array<{ sql: string; params: Record<string, unknown> }> = []
    const qb = {
      andWhere(sql: string, params: Record<string, unknown>) {
        clauses.push({ sql, params })
        return this
      },
    } as unknown as SelectQueryBuilder<ConsultantEntity>

    applyConsultantScope(qb, 'c', 'ws-A', 'user-1')

    // Le prédicat NULL-espace est borné à `c.user_id = :userId` — une fiche sans
    // espace d'un AUTRE utilisateur ne peut donc pas remonter.
    expect(clauses).toHaveLength(1)
    expect(clauses[0]?.sql).toContain('c.workspace_id IS NULL AND c.user_id = :userId')
    expect(clauses[0]?.params).toEqual({ workspaceId: 'ws-A', userId: 'user-1' })
  })

  it('generate() refuse (NotFound) quand la requête cloisonnée ne rend rien', async () => {
    // La requête cloisonnée renvoie null pour une fiche d'un autre espace :
    // generate() doit lever NotFound AVANT de toucher le moindre cv_text.
    const getOne = jest.fn().mockResolvedValue(null)
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne,
    }
    const consultants = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<ConsultantEntity>

    const service = new CvStudioService(consultants, {} as never)

    await expect(
      service.generate('consultant-d-une-autre-esn', 'ws-A', 'user-1', {
        versionKind: 'anonyme',
        templateKey: 'defaut',
        language: 'fr',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException)

    // La barrière est la requête cloisonnée, pas un filtre a posteriori.
    expect(consultants.createQueryBuilder).toHaveBeenCalled()
    expect(getOne).toHaveBeenCalled()
  })
})
