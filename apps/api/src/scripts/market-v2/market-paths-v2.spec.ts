import { deriveMarketPathsV2, mapPositionRow, type MarketPathsV2Store, type PathDraftV2 } from './market-paths-v2'

const CTX = { version: 'v2.1', checksum: 'abc', signalKeyByMatchKey: new Map<string, string | null>() }

const row = (over: Record<string, string> = {}): Record<string, string> => ({
  person_key: 'P1',
  account_name_raw: 'Alten SA',
  account_id: 'BM-A-000001',
  account_name: 'Alten',
  role_title: 'Data Engineer',
  employer_role: 'client final',
  is_current_2024: 'Oui',
  source: 'fr',
  source_date: '2024-01-01',
  confidence: 'haute',
  ...over,
})

const ok = (r: Record<string, string>, ctx = CTX): PathDraftV2 => {
  const mapped = mapPositionRow(r, ctx)
  if ('skipped' in mapped) throw new Error(`écartée : ${mapped.skipped}`)
  return mapped
}

describe('lot 791 — positions (pack v2.1) → market_person_paths', () => {
  it('ligne ESN : work_status esn, esn_name/esn_key = l’entreprise, aucune date fabriquée', () => {
    const d = ok(row({ employer_role: 'ESN', is_current_2024: 'Non' }))
    expect(d).toMatchObject({
      workStatus: 'esn',
      esnName: 'Alten',
      esnKey: 'alten',
      companyName: 'Alten',
      isCurrent: false,
      startDate: null,
      endDate: null,
      datePrecision: null,
      jobTitle: 'Data Engineer',
      personKey: 'P1',
    })
  })

  it('ligne client final : inconnu (on ne devine pas freelance ou salarié), pas d’ESN', () => {
    const d = ok(row())
    expect(d).toMatchObject({ workStatus: 'inconnu', esnName: null, esnKey: null, isCurrent: true })
  })

  it('« autre », vide ou « Oui/Non » absent : inconnu / null', () => {
    expect(ok(row({ employer_role: 'autre' })).workStatus).toBe('inconnu')
    expect(ok(row({ employer_role: '', is_current_2024: '' }))).toMatchObject({
      workStatus: 'inconnu',
      isCurrent: null,
    })
  })

  it('ligne passée : is_current false et toujours aucune date', () => {
    const d = ok(row({ is_current_2024: 'Non' }))
    expect(d.isCurrent).toBe(false)
    expect([d.startDate, d.endDate, d.datePrecision]).toEqual([null, null, null])
  })

  it('NON : sans person_key ou sans entreprise → écartée avec sa raison', () => {
    expect(mapPositionRow(row({ person_key: ' ' }), CTX)).toEqual({ skipped: 'sans_person_key' })
    expect(mapPositionRow(row({ account_id: '', account_name: '', account_name_raw: '' }), CTX)).toEqual({
      skipped: 'sans_entreprise',
    })
  })

  it('l’entreprise se résout vers la clé du corpus quand le nom désigne UNE entreprise, sinon account_id', () => {
    const ctx = {
      ...CTX,
      signalKeyByMatchKey: new Map([
        ['alten', 'alten-corpus'],
        ['dup', null],
      ]),
    }
    expect(ok(row(), ctx).companyKey).toBe('alten-corpus')
    expect(ok(row({ account_name: 'Dup' }), ctx).companyKey).toBe('BM-A-000001')
  })

  it('row_key stable : même (personne, entreprise, poste, source) → même clé ; un autre poste → autre clé', () => {
    expect(ok(row()).rowKey).toBe(ok(row({ confidence: 'basse' })).rowKey)
    expect(ok(row()).rowKey).not.toBe(ok(row({ role_title: 'CTO' })).rowKey)
  })

  it('sans account_id, la clé de ligne vient du nom brut normalisé', () => {
    const a = ok(row({ account_id: '', account_name: '', account_name_raw: 'ALTEN SA' }))
    const b = ok(row({ account_id: '', account_name: '', account_name_raw: 'alten' }))
    expect(a.rowKey).toBe(b.rowKey)
  })
})

function memoryStore(rows: Record<string, string>[]): MarketPathsV2Store & { table: Map<string, PathDraftV2> } {
  const table = new Map<string, PathDraftV2>()
  return {
    table,
    latestPositions: async () => ({ version: 'v2.1', checksum: 'abc' }),
    signalKeyByMatchKey: async () => new Map(),
    readPositions: async function* () {
      yield rows
    },
    upsert: async drafts => {
      for (const d of drafts) table.set(d.rowKey, d)
      return drafts.length
    },
  }
}

describe('lot 791 — dérivation idempotente', () => {
  const rows = [row(), row({ employer_role: 'ESN', person_key: 'P2' }), row({ person_key: '' }), row()]

  it('deux passes = mêmes row_key ; doublons fusionnés et comptés ; écartées comptées', async () => {
    const store = memoryStore(rows)
    const first = await deriveMarketPathsV2({ store, dryRun: false, log: () => undefined })
    const keys = [...store.table.keys()].sort()
    const second = await deriveMarketPathsV2({ store, dryRun: false, log: () => undefined })
    expect([...store.table.keys()].sort()).toEqual(keys)
    expect(first).toMatchObject({
      read: 4,
      written: 2,
      duplicates: 1,
      skipped: { sans_person_key: 1, sans_entreprise: 0 },
    })
    expect(second).toEqual(first)
  })

  it('--dry-run : compte, n’écrit rien', async () => {
    const store = memoryStore(rows)
    const report = await deriveMarketPathsV2({ store, dryRun: true, log: () => undefined })
    expect(report.written).toBe(0)
    expect(report.derived).toBe(2)
    expect(store.table.size).toBe(0)
  })

  it('pack positions absent de la base : erreur claire, rien écrit', async () => {
    const store = { ...memoryStore(rows), latestPositions: async () => null }
    const report = await deriveMarketPathsV2({ store, dryRun: false, log: () => undefined })
    expect(report.error).toMatch(/positions/)
  })
})
