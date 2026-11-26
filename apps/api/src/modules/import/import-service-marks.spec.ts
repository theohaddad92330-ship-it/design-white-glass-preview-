import type { Repository } from 'typeorm'
import type { ImportSessionEntity } from '../../database/entities/import-session.entity'
import { ImportService, type ImportRowWriter, type ImportWriteOutcome } from './import.service'

// #AM.10 (#4051.10) — l'assistant /settings/import laisse « Importé de <source> le <date> » sur chaque fiche touchée.
const WS = 'ws-1'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

function build(objectType: 'account' | 'contact' | 'need', outcome: Partial<ImportWriteOutcome>) {
  const queries: { sql: string; params: unknown[] }[] = []
  const session = {
    id: 's-1',
    workspace_id: WS,
    source: 'hubspot',
    object_type: objectType,
    state: 'simulated',
    mapping: { columns: { Nom: 'company_name' }, disabledRules: [] },
    report: { rowsRead: 1 },
    report_at: new Date(),
    created_count: 0,
    updated_count: 0,
    snapshot: [],
  }
  const sessions = {
    findOne: jest.fn(async () => session),
    save: jest.fn(async (value: unknown) => value),
    update: jest.fn(async () => undefined),
    manager: { query: async (sql: string, params: unknown[]) => void queries.push({ sql, params }) },
  } as unknown as Repository<ImportSessionEntity>
  const done = {
    created: 0,
    updated: 0,
    skippedUnknownCompany: 0,
    snapshot: [],
    processedRows: 1,
    failure: null,
    ...outcome,
  }
  const write = jest.fn(async () => done)
  const writer = { writeAccounts: write, writeContacts: write, writeNeeds: write } as unknown as ImportRowWriter
  return { service: new ImportService(sessions), writer, queries }
}

describe('ImportService.writeSession — #AM.10 la trace d’import sur la fiche', () => {
  it('une trace par fiche créée OU complétée, nommée par l’outil d’origine', async () => {
    const h = build('account', {
      created: 1,
      updated: 1,
      snapshot: [
        { id: A, created: true, fields: {} },
        { id: B, created: false, fields: {} },
      ],
    })
    await h.service.writeSession('user-1', WS, 's-1', 'Nom\nAcme', h.writer)
    const mark = h.queries.find(q => q.sql.includes('INSERT INTO record_import_marks'))
    expect(mark?.params).toEqual([WS, 'account', [A, B], 'tool', 'hubspot'])
  })

  it('un contact reçoit la trace sur sa fiche contact', async () => {
    const h = build('contact', { created: 1, snapshot: [{ id: A, created: true, fields: {} }] })
    await h.service.writeSession('user-1', WS, 's-1', 'Nom\nAcme', h.writer)
    expect(h.queries.find(q => q.sql.includes('record_import_marks'))?.params).toEqual([
      WS,
      'contact',
      [A],
      'tool',
      'hubspot',
    ])
  })

  it('NON : un besoin n’a pas d’historique de fiche — aucune trace ; un import vide non plus', async () => {
    const need = build('need', { created: 1, snapshot: [{ id: A, created: true, fields: {} }] })
    await need.service.writeSession('user-1', WS, 's-1', 'Nom\nAcme', need.writer)
    expect(need.queries.filter(q => q.sql.includes('record_import_marks'))).toEqual([])
    const empty = build('account', {})
    await empty.service.writeSession('user-1', WS, 's-1', 'Nom\nAcme', empty.writer)
    expect(empty.queries.filter(q => q.sql.includes('record_import_marks'))).toEqual([])
  })
})
