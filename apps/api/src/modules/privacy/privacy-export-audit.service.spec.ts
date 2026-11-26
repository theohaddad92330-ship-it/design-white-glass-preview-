import { PrivacyExportAuditService } from './privacy-export-audit.service'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { PrivacyExportAuditLogEntity } from '../../database/entities/privacy-export-audit-log.entity'

const USER = 'user-abc'

function makeService(): { service: PrivacyExportAuditService; repo: MockRepository<PrivacyExportAuditLogEntity> } {
  const repo = createMockRepository<PrivacyExportAuditLogEntity>()
  return { service: new PrivacyExportAuditService(repo as never), repo }
}

/**
 * #2439.15 — « un export respecte … l'audit » (LAU-FINAL-152). Rien ne
 * journalisait `GET /privacy/export` ni `GET /privacy/export/object` : cette
 * table est la trace qui manquait.
 */
describe('PrivacyExportAuditService', () => {
  it('journalise un export COMPLET : kind=full, sans objet ni format', async () => {
    const { service, repo } = makeService()
    await service.recordFullExport(USER)
    expect(repo.insert).toHaveBeenCalledWith({ user_id: USER, kind: 'full', object_key: null, format: null })
  })

  it('journalise un export D’UN OBJET : kind=object, avec sa clé et son format', async () => {
    const { service, repo } = makeService()
    await service.recordObjectExport(USER, 'contacts', 'csv')
    expect(repo.insert).toHaveBeenCalledWith({ user_id: USER, kind: 'object', object_key: 'contacts', format: 'csv' })
  })

  it('ne journalise jamais un AUTRE utilisateur que celui de l’appel', async () => {
    const { service, repo } = makeService()
    await service.recordFullExport(USER)
    const [call] = repo.insert.mock.calls[0]
    expect(call.user_id).toBe(USER)
  })
})

/**
 * #2439.15 / #2439.7 — CETTE TABLE A ENFIN UN LECTEUR : le commentaire de tête
 * du service disait « aucun lecteur produit pour l'instant ». `listRecentForUser`
 * lit exactement ce que la table journalise — jamais une donnée inventée.
 */
describe('PrivacyExportAuditService — listRecentForUser (#2439.7/.8/.17, catégorie « exports »)', () => {
  it('lit les vingt plus récentes lignes de CET utilisateur, les plus récentes d’abord', async () => {
    const { service, repo } = makeService()
    repo.find.mockResolvedValue([
      { id: '1', user_id: USER, kind: 'full', object_key: null, format: null, created_at: new Date('2026-09-27') },
    ])
    const rows = await service.listRecentForUser(USER)
    expect(repo.find).toHaveBeenCalledWith({
      where: { user_id: USER },
      order: { created_at: 'DESC' },
      take: 20,
    })
    expect(rows).toEqual([{ kind: 'full', objectKey: null, format: null, createdAt: '2026-09-27T00:00:00.000Z' }])
  })

  it('rend un tableau vide plutôt qu’une ligne inventée quand rien n’a encore été exporté', async () => {
    const { service, repo } = makeService()
    repo.find.mockResolvedValue([])
    expect(await service.listRecentForUser(USER)).toEqual([])
  })
})
