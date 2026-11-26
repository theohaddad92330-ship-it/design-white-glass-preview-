import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkHeader,
  loadMarketV2Schema,
  piiColumnsOf,
  PII_FLAG_CORRECTIONS,
  runMarketV2Import,
  splitRecord,
  type MarketV2Row,
  type MarketV2Schema,
  type MarketV2Store,
  type MarketV2Table,
  type MarketV2TableLoad,
} from './market-v2-import'

/**
 * Fixtures SYNTHÉTIQUES générées depuis `market-v2-schema.json` — jamais une vraie donnée : chaque cellule vaut
 * `v<ligne>_<colonne>`. Trois vraies tables du schéma (en-têtes exacts) : une table « data » avec `account_id`, une
 * table d'identités (`data_restricted_pii`, toutes colonnes `pii=1`), un référentiel.
 */
const BOM = String.fromCharCode(0xfeff)
const FULL = loadMarketV2Schema()
const PICKED = ['account_aggregates', 'people', 'ref_domaines'] as const

function subSchema(): MarketV2Schema {
  return { ...FULL, tables: FULL.tables.filter(t => (PICKED as readonly string[]).includes(t.table)) }
}

function table(name: string): MarketV2Table {
  const found = FULL.tables.find(t => t.table === name)
  if (!found) throw new Error(`table absente du schéma : ${name}`)
  return found
}

function csvLine(cells: string[]): string {
  return cells.map(c => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')
}

function writePack(schema: MarketV2Schema, rowsPerTable: number, manifest = 'file;sha256\nx;y\n'): string {
  const dir = mkdtempSync(join(tmpdir(), 'market-v2-'))
  writeFileSync(join(dir, 'MANIFEST.csv'), manifest)
  for (const t of schema.tables) {
    mkdirSync(join(dir, t.folder), { recursive: true })
    const lines = [csvLine(t.header)]
    for (let r = 1; r <= rowsPerTable; r += 1) lines.push(csvLine(t.header.map((_, c) => `v${r}_${c}`)))
    writeFileSync(join(dir, t.file), `${BOM}${lines.join('\r\n')}\r\n`)
  }
  return dir
}

/** Un double de base en mémoire qui a la sémantique d'une TRANSACTION par table : rien n'est visible tant que la
 *  table n'a pas été entièrement consommée ; `crashOn` lève au milieu de la table nommée (coupure). */
function memoryStore(opts: { crashOn?: string } = {}) {
  const committed = new Map<string, MarketV2Row[]>()
  const loads: string[] = []
  const store: MarketV2Store = {
    async loadedTables(version) {
      return new Set([...committed.keys()].filter(k => k.startsWith(`${version}/`)).map(k => k.split('/')[1] as string))
    },
    async loadTable(load: MarketV2TableLoad, batches) {
      loads.push(load.table)
      const pending: MarketV2Row[] = []
      for await (const batch of batches) {
        pending.push(...batch)
        if (opts.crashOn === load.table) throw new Error('connexion perdue')
      }
      const key = `${load.version}/${load.table}`
      const existing = committed.get(key) ?? []
      const seen = new Set(existing.map(r => r.rowNo))
      committed.set(key, [...existing, ...pending.filter(r => !seen.has(r.rowNo))])
      return { written: pending.length }
    },
  }
  return { store, committed, loads }
}

const quiet = { log: () => undefined }
const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

describe('schéma du pack v2.1', () => {
  it('LIT quelque chose — 139 tables, 2 338 468 lignes, des colonnes pii', () => {
    expect(FULL.tables).toHaveLength(139)
    expect(FULL.tables.reduce((n, t) => n + t.rows, 0)).toBe(2_338_468)
    expect(piiColumnsOf(table('people')).length).toBe(table('people').header.length)
    expect(piiColumnsOf(table('account_aggregates'))).toEqual([])
  })
})

describe('corrections du drapeau pii', () => {
  it('chaque correction vise une colonne RÉELLE que le dictionnaire marque pii=0', () => {
    const stale = Object.entries(PII_FLAG_CORRECTIONS).flatMap(([name, columns]) =>
      columns
        .filter(column => table(name).columns.find(c => c.column === column)?.pii !== '0')
        .map(c => `${name}.${c}`),
    )
    expect(stale).toEqual([])
  })

  it('un e-mail de contact marqué pii=0 part quand même au coffre', () => {
    const t = table('needs')
    const parsed = splitRecord(
      t,
      t.header.map((_, c) => `v1_${c}`),
      1,
    )
    if (parsed.kind !== 'row') throw new Error('ligne attendue')
    expect('client_contact_email' in parsed.row.data).toBe(false)
    expect('client_contact_email' in parsed.row.identity).toBe(true)
  })
})

describe('contrôle d’en-tête', () => {
  const t = table('account_aggregates')
  it('accepte l’en-tête exact', () => {
    expect(checkHeader(t, [...t.header])).toBeNull()
  })
  it('refuse une colonne manquante, en trop ou déplacée — en NOMMANT les colonnes', () => {
    const missing = checkHeader(t, t.header.slice(1))
    expect(missing).toContain('manquantes : account_name_raw')
    expect(checkHeader(t, [...t.header, 'surprise'])).toContain('inattendues : surprise')
    const swapped = [t.header[1], t.header[0], ...t.header.slice(2)] as string[]
    expect(checkHeader(t, swapped)).toContain('ordre')
  })
})

describe('découpe d’une ligne', () => {
  it('sépare les cellules pii (coffre) des autres, et tire account_id quand il n’est pas pii', () => {
    const t = table('account_aggregates')
    const cells = t.header.map((_, c) => (c === 6 ? '' : `v1_${c}`))
    const parsed = splitRecord(t, cells, 7)
    expect(parsed.kind).toBe('row')
    if (parsed.kind !== 'row') return
    expect(parsed.row.rowNo).toBe(7)
    expect(parsed.row.accountId).toBe('v1_1')
    expect(parsed.row.identity).toEqual({})
    // une cellule vide n'est pas une valeur : absente, jamais ''.
    expect('value' in parsed.row.data).toBe(false)
  })

  it('une table pii ne laisse RIEN dans `data`', () => {
    const t = table('people')
    const parsed = splitRecord(
      t,
      t.header.map((_, c) => `v1_${c}`),
      1,
    )
    if (parsed.kind !== 'row') throw new Error('ligne attendue')
    expect(parsed.row.data).toEqual({})
    expect(Object.keys(parsed.row.identity)).toHaveLength(t.header.length)
    expect(parsed.row.accountId).toBeNull()
  })

  it('écarte une ligne au mauvais nombre de cellules, avec une raison SANS valeur', () => {
    const t = table('ref_domaines')
    const parsed = splitRecord(t, ['secret-valeur'], 3)
    expect(parsed).toEqual({ kind: 'rejected', reason: expect.stringContaining('ligne 3') })
    if (parsed.kind === 'rejected') expect(parsed.reason).not.toContain('secret-valeur')
  })
})

describe('runMarketV2Import', () => {
  it('charge chaque table, version = sha256 de MANIFEST.csv, rapport lues/écrites/rejetées', async () => {
    const schema = subSchema()
    const manifest = 'file;sha256\nsynthetique;0\n'
    const dir = writePack(schema, 5, manifest)
    dirs.push(dir)
    const { store, committed } = memoryStore()
    const report = await runMarketV2Import({ dir, schema, store, batchSize: 2, ...quiet })
    expect(report.version).toBe(createHash('sha256').update(manifest).digest('hex'))
    expect(report.error).toBeUndefined()
    expect(report.tables.map(t => [t.table, t.status, t.read, t.written, t.rejected])).toEqual(
      schema.tables.map(t => [t.table, 'loaded', 5, 5, 0]),
    )
    expect(committed.get(`${report.version}/people`)?.[0]?.data).toEqual({})
  })

  it('rejeu du même pack : rien n’est relu ni dupliqué', async () => {
    const schema = subSchema()
    const dir = writePack(schema, 4)
    dirs.push(dir)
    const { store, committed, loads } = memoryStore()
    await runMarketV2Import({ dir, schema, store, ...quiet })
    const second = await runMarketV2Import({ dir, schema, store, ...quiet })
    expect(second.tables.every(t => t.status === 'skipped')).toBe(true)
    expect(loads).toHaveLength(schema.tables.length)
    for (const rows of committed.values()) expect(rows).toHaveLength(4)
  })

  it('reprise après coupure : la table coupée n’a rien laissé, la relance saute les tables déjà chargées', async () => {
    const schema = subSchema()
    const dir = writePack(schema, 6)
    dirs.push(dir)
    const crashed = schema.tables[1]?.table as string
    const first = memoryStore({ crashOn: crashed })
    const r1 = await runMarketV2Import({ dir, schema, store: first.store, batchSize: 2, ...quiet })
    expect(r1.error).toContain(crashed)
    expect(r1.tables.map(t => t.status)).toEqual(['loaded', 'failed'])
    expect([...first.committed.keys()]).toHaveLength(1)

    // La relance (même base, connexion revenue).
    const healthy = memoryStore()
    for (const [k, v] of first.committed) healthy.committed.set(k, v)
    const r2 = await runMarketV2Import({ dir, schema, store: healthy.store, ...quiet })
    expect(r2.tables.map(t => t.status)).toEqual(['skipped', 'loaded', 'loaded'])
    for (const rows of healthy.committed.values()) expect(rows).toHaveLength(6)
  })

  it('un en-tête faux ARRÊTE tout avant la première écriture', async () => {
    const schema = subSchema()
    const dir = writePack(schema, 2)
    dirs.push(dir)
    const last = schema.tables[2] as MarketV2Table
    writeFileSync(join(dir, last.file), `${BOM}${csvLine(['autre', ...last.header.slice(1)])}\nx\n`)
    const { store, loads } = memoryStore()
    const report = await runMarketV2Import({ dir, schema, store, ...quiet })
    expect(report.error).toContain(last.table)
    expect(report.error).toContain('manquantes')
    expect(loads).toEqual([])
  })

  it('MANIFEST.csv absent : arrêt clair', async () => {
    const schema = subSchema()
    const dir = writePack(schema, 1)
    dirs.push(dir)
    rmSync(join(dir, 'MANIFEST.csv'))
    const report = await runMarketV2Import({ dir, schema, store: memoryStore().store, ...quiet })
    expect(report.error).toContain('MANIFEST.csv')
  })

  it('--only=<table> ne charge que cette table ; une table inconnue est refusée', async () => {
    const schema = subSchema()
    const dir = writePack(schema, 3)
    dirs.push(dir)
    const { store, loads } = memoryStore()
    const only = await runMarketV2Import({ dir, schema, store, only: 'ref_domaines', ...quiet })
    expect(only.tables.map(t => t.table)).toEqual(['ref_domaines'])
    expect(loads).toEqual(['ref_domaines'])
    const unknown = await runMarketV2Import({ dir, schema, store, only: 'nope', ...quiet })
    expect(unknown.error).toContain('nope')
  })

  it('--dry-run (store absent) lit et compte tout, n’écrit rien', async () => {
    const schema = subSchema()
    const dir = writePack(schema, 3)
    dirs.push(dir)
    const report = await runMarketV2Import({ dir, schema, store: null, ...quiet })
    expect(report.tables.map(t => [t.status, t.read, t.written])).toEqual(schema.tables.map(() => ['dry-run', 3, 0]))
  })

  it('aucune valeur de donnée dans le journal', async () => {
    const schema = subSchema()
    const dir = writePack(schema, 3)
    dirs.push(dir)
    const lines: string[] = []
    await runMarketV2Import({ dir, schema, store: memoryStore().store, log: l => lines.push(l) })
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.join('\n')).not.toMatch(/v\d+_\d+/)
  })

  it('un champ cité qui contient `;` et un retour à la ligne reste UNE cellule', async () => {
    const t = table('ref_domaines')
    const schema = { ...FULL, tables: [t] }
    const dir = writePack(schema, 0)
    dirs.push(dir)
    const cells = t.header.map((_, c) => (c === 0 ? 'a;b\nc | d' : `v1_${c}`))
    writeFileSync(join(dir, t.file), `${BOM}${csvLine(t.header)}\n${csvLine(cells)}\n`)
    const { store, committed } = memoryStore()
    const report = await runMarketV2Import({ dir, schema, store, ...quiet })
    expect(report.tables[0]?.rejected).toBe(0)
    const row = [...committed.values()][0]?.[0]
    expect(row?.data[t.header[0] as string]).toBe('a;b\nc | d')
  })
})
