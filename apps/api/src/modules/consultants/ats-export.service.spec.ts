import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import { AtsExportService } from './ats-export.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'

function makeService(rows: Partial<ConsultantEntity>[]) {
  const repo = { find: jest.fn(async () => rows as ConsultantEntity[]) } as unknown as Repository<ConsultantEntity>
  return { service: new AtsExportService(repo), repo }
}

describe('#2326.8 — AtsExportService — le vivier entier, jamais un filtre', () => {
  it('rend une ligne par consultant, prénom/nom dérivés', async () => {
    const { service } = makeService([
      {
        id: 'c1',
        full_name: 'Jean Dupont',
        email: 'jean@acme.fr',
        phone: null,
        title: 'Dev',
        seniority: 'senior',
        availability: 'immediate',
        availability_checked_at: new Date(),
        available_from: null,
        tjm: 650,
        engagement_kind: 'salarie',
        source: 'manual',
      },
    ])
    const report = await service.export(WORKSPACE)
    expect(report.items).toHaveLength(1)
    expect(report.items[0]).toMatchObject({ consultantId: 'c1', firstName: 'Jean', lastName: 'Dupont' })
    expect(report.truncated).toBe(false)
  })

  it("n'interroge que l'espace demandé, jamais archivé", async () => {
    const { service, repo } = makeService([])
    await service.export(WORKSPACE)
    const args = (repo.find as jest.Mock).mock.calls[0]![0]
    expect(args.where.workspace_id).toBe(WORKSPACE)
    expect(args.where.archived_at).toBeDefined()
  })
})
