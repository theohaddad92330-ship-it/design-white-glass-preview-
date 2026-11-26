import { AccountsService } from './accounts.service'
import { createMockRepository } from '../../database/test-utils'

/**
 * #4731 — UN COÉQUIPIER AGIT SUR UN COMPTE ANALYSÉ PAR UN AUTRE.
 *
 * Le défaut : les gestes d'écriture du service filtraient `WHERE id = ? AND
 * user_id = <appelant>` — un filtre de PROPRIÉTÉ, pas de droit. Le coéquipier
 * qui n'avait pas lancé l'analyse voyait le compte (les lectures passent par
 * l'espace) mais son geste touchait zéro ligne. Doctrine c76 : le rôle change
 * l'ordre, jamais le contenu — et a fortiori pas « qui a lancé l'analyse ».
 *
 * Le dépôt ci-dessous applique RÉELLEMENT les filtres `where` : un filtre de
 * propriété oublié fait échouer ici, comme un filtre d'espace retiré.
 */
type Row = Record<string, unknown>

const USERS: Record<string, string> = { 'user-a': 'ws-1', 'user-b': 'ws-1', 'user-c': 'ws-2' }

function build() {
  const rows: Row[] = [
    { id: 'acc-1', user_id: 'user-a', workspace_id: 'ws-1', status: 'completed', commercial_status: 'inbox' },
    { id: 'acc-old', user_id: 'user-a', workspace_id: null, status: 'completed', commercial_status: 'inbox' },
  ]
  const cell = (c: unknown, v: unknown): boolean =>
    v && typeof v === 'object' && (v as { type?: string }).type === 'isNull' ? c == null : c === v
  const matches = (row: Row, where: Row | Row[]) =>
    (Array.isArray(where) ? where : [where]).some(w => Object.entries(w).every(([k, v]) => cell(row[k], v)))
  const repo = createMockRepository<never>()
  repo.update.mockImplementation((async (where: Row | Row[], patch: Row) => {
    const hit = rows.filter(r => matches(r, where))
    hit.forEach(r => Object.assign(r, patch))
    return { affected: hit.length }
  }) as never)
  repo.findOne.mockImplementation(
    (async (opts: { where: Row | Row[] }) => rows.find(r => matches(r, opts.where)) ?? null) as never,
  )
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async (userId: string) => ({ workspaceId: USERS[userId], role: 'member' })),
  }
  const service = new AccountsService(repo as never, {} as never, workspaceContext as never, {} as never)
  return { service, row: rows[0], old: rows[1] }
}

describe('#4731 — les gestes sur un compte sont ouverts à tout l’espace', () => {
  it('un coéquipier archive le compte analysé par un autre', async () => {
    const { service, row } = build()
    await service.archive('acc-1', 'user-b')
    expect(row.status).toBe('archived')
  })

  it('un coéquipier change le statut commercial', async () => {
    const { service, row } = build()
    await service.setCommercialStatus('acc-1', 'user-b', 'opportunity')
    expect(row.commercial_status).toBe('opportunity')
  })

  it('un coéquipier relance, puis annule, l’analyse', async () => {
    const { service, row } = build()
    await service.markAnalyzing('acc-1', 'user-b')
    expect(row.status).toBe('analyzing')
    await service.markCancelled('acc-1', 'user-b')
    expect(row.status).toBe('canceled')
  })

  it('un coéquipier retire le compte', async () => {
    const { service, row } = build()
    await service.delete('acc-1', 'user-b')
    expect(row.status).toBe('deleted')
  })

  it('un utilisateur d’un AUTRE espace ne touche rien — on ouvre à l’espace, jamais au-delà', async () => {
    const { service, row } = build()
    await service.archive('acc-1', 'user-c')
    await service.setCommercialStatus('acc-1', 'user-c', 'opportunity')
    await service.markAnalyzing('acc-1', 'user-c')
    await service.delete('acc-1', 'user-c')
    expect(row.status).toBe('completed')
    expect(row.commercial_status).toBe('inbox')
  })

  it('une ligne ANCIENNE (workspace_id NULL) garde son geste pour son propriétaire, pas pour un autre', async () => {
    // #4731 suite A — sans le OU, le compte ancien n'était plus atteint par PERSONNE.
    const { service, old } = build()
    await service.archive('acc-old', 'user-b')
    expect(old.status).toBe('completed')
    await service.archive('acc-old', 'user-a')
    expect(old.status).toBe('archived')
  })
})
