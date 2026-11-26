import { NotFoundException } from '@nestjs/common'
import { McpAccessIntentsService } from './mcp-access-intents.service'

const WS = 'w0000000-0000-4000-8000-000000000001'
const ME = 'u0000000-0000-4000-8000-000000000001'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  name: 'Assistant de Théo',
  perimeter: 'mine',
  status: 'pending',
  requested_by: ME,
  first_name: 'Théo',
  last_name: 'Haddad',
  created_at: new Date('2026-10-22T08:00:00.000Z'),
  decided_at: null,
  ...over,
})

function build(rows: Array<Record<string, unknown>>, affected = 1) {
  const query = jest.fn(async () => rows)
  const repo = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: Record<string, unknown>) => ({ ...v, id: 'i1' })),
    update: jest.fn(async () => ({ affected })),
    manager: { query },
  }
  return { service: new McpAccessIntentsService(repo as never), repo, query }
}

describe('McpAccessIntentsService — Théo D settings-outils.N1', () => {
  it('crée une intention en attente, au nom du demandeur, et la rend avec son nom en clair', async () => {
    const { service, repo } = build([row()])
    const view = await service.create(WS, ME, { name: 'Assistant de Théo', perimeter: 'mine' })
    expect(repo.create).toHaveBeenCalledWith({
      workspace_id: WS,
      requested_by: ME,
      name: 'Assistant de Théo',
      perimeter: 'mine',
    })
    expect(view).toMatchObject({ status: 'pending', requestedByName: 'Théo Haddad', decidedAt: null })
  })

  it('« mes demandes » est borné à l’espace ET au demandeur', async () => {
    const { service, query } = build([row()])
    await service.listMine(WS, ME)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('i.requested_by = $2'), [WS, ME])
  })

  it('les demandes en attente sont celles de l’espace, jamais d’un autre', async () => {
    const { service, query } = build([row()])
    await service.listPending(WS)
    expect(query).toHaveBeenCalledWith(expect.stringContaining("i.status = 'pending'"), [WS])
  })

  it('trancher pose la décision et l’auteur', async () => {
    const { service, repo } = build([row({ status: 'approved', decided_at: new Date('2026-10-22T09:00:00.000Z') })])
    const view = await service.decide(WS, 'u-admin', 'i1', { decision: 'approved' })
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'i1', workspace_id: WS, status: 'pending' },
      expect.objectContaining({ status: 'approved', decided_by: 'u-admin' }),
    )
    expect(view.status).toBe('approved')
  })

  it('⚠️ SAIT DIRE NON — une demande déjà tranchée (ou d’un autre espace) ne se retranche pas', async () => {
    const { service } = build([row()], 0)
    await expect(service.decide(WS, 'u-admin', 'i1', { decision: 'declined' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('un demandeur sans profil n’a pas de nom inventé', async () => {
    const { service } = build([row({ first_name: null, last_name: null })])
    const [view] = await service.listMine(WS, ME)
    expect(view?.requestedByName).toBeNull()
  })
})
