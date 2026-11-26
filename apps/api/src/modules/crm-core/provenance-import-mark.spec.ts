import { ProvenanceService } from './provenance.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'

/** #4051 — la trace « Importé le <date> depuis <source> » : écrite par les imports, lue par l'historique de la fiche. */
function build(rows: unknown[] = []) {
  const query = jest.fn(async () => rows)
  const service = new ProvenanceService({} as never, { manager: { query } } as never)
  return { service, query }
}

describe('ProvenanceService — la trace d’import d’une fiche (#4051)', () => {
  it('écrit UNE trace par fiche, avec la source nommée (fichier ou outil branché)', async () => {
    const { service, query } = build()
    await service.markImported({
      workspaceId: WORKSPACE,
      entityType: 'account',
      entityIds: [ACCOUNT, 'a0000000-0000-4000-8000-000000000002'],
      sourceKind: 'file',
      sourceLabel: 'export-hubspot.csv',
    })
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('INSERT INTO record_import_marks')
    expect(params).toEqual([
      WORKSPACE,
      'account',
      [ACCOUNT, 'a0000000-0000-4000-8000-000000000002'],
      'file',
      'export-hubspot.csv',
    ])
  })

  it('⚠️ SAIT DIRE NON — aucune fiche, ou une source sans nom : rien n’est écrit', async () => {
    const { service, query } = build()
    await service.markImported({
      workspaceId: WORKSPACE,
      entityType: 'contact',
      entityIds: [],
      sourceKind: 'file',
      sourceLabel: 'x.csv',
    })
    await service.markImported({
      workspaceId: WORKSPACE,
      entityType: 'contact',
      entityIds: [ACCOUNT],
      sourceKind: 'file',
      sourceLabel: '  ',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('lit la trace la plus récente, datée ISO', async () => {
    const { service } = build([
      { importedAt: new Date('2026-10-14T08:00:00.000Z'), sourceKind: 'tool', sourceLabel: 'HubSpot' },
    ])
    expect(await service.latestImportMark(WORKSPACE, 'account', ACCOUNT)).toEqual({
      importedAt: '2026-10-14T08:00:00.000Z',
      sourceKind: 'tool',
      sourceLabel: 'HubSpot',
    })
  })

  it('⚠️ SAIT DIRE NON — une fiche jamais importée n’a AUCUNE trace (null, jamais une date devinée)', async () => {
    const { service } = build([])
    expect(await service.latestImportMark(WORKSPACE, 'account', ACCOUNT)).toBeNull()
  })
})
