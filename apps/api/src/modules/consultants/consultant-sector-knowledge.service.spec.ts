import { ConsultantsService } from './consultants.service'

// #5017.2 — REFUS : la carte « consultants qui connaissent ce secteur » ne sort jamais les fiches d'un AUTRE espace.
function serviceWith(rowsByWorkspace: Record<string, Record<string, unknown>[]>) {
  const calls: { where: string; params: Record<string, unknown> }[] = []
  const qb = {
    params: {} as Record<string, unknown>,
    orderBy() {
      return this
    },
    where(where: string, params: Record<string, unknown>) {
      this.params = params
      calls.push({ where, params })
      return this
    },
    andWhere(where: string) {
      calls.push({ where, params: {} })
      return this
    },
    async getMany() {
      return rowsByWorkspace[String(this.params.workspaceId)] ?? []
    },
  }
  const repo = { createQueryBuilder: () => ({ ...qb, params: {} }) }
  const service = new ConsultantsService(
    repo as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  )
  return { service, calls }
}

describe('ConsultantsService.listKnowingSector', () => {
  const rowsByWorkspace = {
    w1: [{ id: 'c1', full_name: 'Nadia', sectors: ['Banque'], archived_at: null }],
    w2: [{ id: 'c9', full_name: 'Autre espace', sectors: ['Banque'], archived_at: null }],
  }

  it("ne lit que l'espace actif : jamais le consultant d'un autre espace", async () => {
    const { service } = serviceWith(rowsByWorkspace)
    const out = await service.listKnowingSector('w1', 'u1', 'Banque')
    expect(out.consultants.map(c => c.id)).toEqual(['c1'])
  })

  it('filtre sur workspace_id et exclut les archivés dans la requête', async () => {
    const { service, calls } = serviceWith(rowsByWorkspace)
    await service.listKnowingSector('w1', 'u1', 'Banque')
    expect(calls[0]?.where).toContain('c.workspace_id = :workspaceId')
    expect(calls.some(c => c.where.includes('archived_at IS NULL'))).toBe(true)
  })
})
