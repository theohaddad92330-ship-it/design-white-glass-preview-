import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IMPORTABLE_FILES } from '../modules/market-memory/market-memory-import'
import {
  loadPack,
  runVersionedImport,
  type ImportDeps,
  type ImportRunLogEntry,
  type ImportTableInput,
  type ImportTransactionHandle,
  type TableWriteOps,
} from './ingest-market-memory'

const VINTAGE = {
  datasetVersion: 'v1',
  methodologyVersion: 'resolution-v3',
  sourceArtifactUri: 'https://drive.example/pack-v1',
  periodStart: '2026-01-01',
  periodEnd: '2026-08-31',
}
const CHECKSUMS = { '02_entreprises.csv': 'abc' }

/**
 * Un double de TRANSACTION en mémoire — le même contrat que le QueryRunner
 * réel (`beginTransaction` / `ops` / `commit` / `rollback`), sans base.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL PROUVE, ET CE QU'IL NE PROUVE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il prouve que `runVersionedImport` COMMANDE bien la transaction — il
 * n'ouvre le pending que dans un buffer séparé du `committed`, et ne fusionne
 * l'un dans l'autre qu'à `commit()` ; `rollback()` jette le buffer entier. Il
 * ne prouve PAS que PostgreSQL lui-même respecte ACID — ça, c'est le travail
 * de Postgres, pas de ce lot. Ce qui manquait avant #1616.4, mesuré : AUCUNE
 * transaction n'englobait le passage, donc un plantage au lot 10 sur 20
 * laissait les lots 1 à 9 déjà écrits — c'est CE défaut-ci que le double
 * reproduit puis referme.
 */
class FakeTransactionalStore {
  private committed = new Map<string, Map<string, Record<string, unknown>>>()
  private pending = new Map<string, Map<string, Record<string, unknown>>>()
  private rowsWrittenThisRun = 0
  private failAfterRows: number | null = null
  readonly logs: ImportRunLogEntry[] = []

  /** Simule « un plantage après N lignes écrites », tous batches confondus. */
  failAfter(rows: number): void {
    this.failAfterRows = rows
  }

  rowCount(table: string): number {
    return this.committed.get(table)?.size ?? 0
  }

  committedRow(table: string, key: string): Record<string, unknown> | undefined {
    return this.committed.get(table)?.get(key)
  }

  deps(): ImportDeps {
    return {
      beginTransaction: async (): Promise<ImportTransactionHandle> => {
        const pending = new Map<string, Map<string, Record<string, unknown>>>()
        this.rowsWrittenThisRun = 0

        const ops = (table: string): TableWriteOps => ({
          fetchExisting: async keys => {
            const committedTable = this.committed.get(table) ?? new Map()
            const found = new Map<string, Record<string, unknown>>()
            for (const key of keys) {
              const row = committedTable.get(key)
              if (row) found.set(key, row)
            }
            return found
          },
          write: async rows => {
            // Chunké comme la production (BATCH_SIZE) — un plantage « au lot
            // 10 sur 20 » ne veut rien dire si tout part en un seul appel.
            const CHUNK = 2
            for (let i = 0; i < rows.length; i += CHUNK) {
              const chunk = rows.slice(i, i + CHUNK)
              for (const row of chunk) {
                this.rowsWrittenThisRun += 1
                if (this.failAfterRows !== null && this.rowsWrittenThisRun > this.failAfterRows) {
                  throw new Error(`panne simulée après ${this.failAfterRows} lignes écrites`)
                }
                const tableMap = pending.get(table) ?? new Map<string, Record<string, unknown>>()
                tableMap.set(String(row['key']), row)
                pending.set(table, tableMap)
              }
            }
          },
        })

        return {
          ops,
          commit: async () => {
            for (const [table, rows] of pending) {
              const committedTable = this.committed.get(table) ?? new Map<string, Record<string, unknown>>()
              for (const [key, row] of rows) committedTable.set(key, row)
              this.committed.set(table, committedTable)
            }
          },
          rollback: async () => {
            // Rien à faire : `pending` n'a jamais touché `committed`.
          },
        }
      },
      logRun: async entry => {
        this.logs.push(entry)
      },
    }
  }
}

function tableInput(drafts: Record<string, unknown>[], rejected = 0): ImportTableInput {
  return {
    table: 'fake_table',
    read: drafts.length + rejected,
    rejected,
    drafts,
    keyOf: draft => String(draft['key']),
    compareFields: ['value'],
  }
}

describe('#1616.4 — runVersionedImport : la transaction qui manquait', () => {
  it("RED (documenté) — sans transaction, un plantage au lot 10 sur 20 laissait un état MIXTE : c'est le défaut mesuré avant ce lot, reproduit ci-dessous puis refermé par le test suivant", () => {
    // Preuve du défaut d'AVANT #1616.4 : l'ancien script appelait
    // `signalRepo.upsert(...)` batch par batch, chacun étant sa PROPRE
    // transaction implicite Postgres. Un throw au batch 3 sur 5 laissait les
    // batches 1 et 2 commités. On le rejoue ici SANS passer par
    // `runVersionedImport`, pour que le rouge soit visible et daté.
    const committedAfterEachBatch: number[] = []
    let total = 0
    try {
      for (let batch = 0; batch < 5; batch += 1) {
        if (batch === 2) throw new Error('panne simulée au batch 2 sur 5')
        total += 1
        committedAfterEachBatch.push(total) // chaque batch commite IMMÉDIATEMENT, à l'ancienne
      }
    } catch {
      // le batch 3+ n'arrive jamais — mais 1 et 2 sont déjà "commités"
    }
    // ⚠️ C'est EXACTEMENT le défaut : 2 batches persistés malgré la panne.
    expect(committedAfterEachBatch).toEqual([1, 2])
    expect(total).toBeGreaterThan(0) // état MIXTE — ni tout, ni rien.
  })

  it('un plantage au milieu ne laisse AUCUNE trace en base — la transaction annule tout', async () => {
    const store = new FakeTransactionalStore()
    store.failAfter(3) // panne après 3 lignes écrites, sur un total de 6

    const drafts = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }))
    const result = await runVersionedImport([tableInput(drafts)], VINTAGE, CHECKSUMS, store.deps())

    expect(result.status).toBe('failed')
    // ⚠️ LE CŒUR DE LA PREUVE : zéro ligne persistée, alors que 3 lignes sur 6
    // avaient déjà été "écrites" avant la panne (voir le compteur interne du
    // double). Avant #1616.4, ces 3 lignes auraient survécu au rollback.
    expect(store.rowCount('fake_table')).toBe(0)

    // La panne est journalisée quand même — sinon un échec ne laisse aucune trace.
    expect(store.logs).toHaveLength(1)
    expect(store.logs[0]?.status).toBe('failed')
  })

  it('un run réussi laisse persister EXACTEMENT les lignes écrites', async () => {
    const store = new FakeTransactionalStore()
    const drafts = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }))
    const result = await runVersionedImport([tableInput(drafts)], VINTAGE, CHECKSUMS, store.deps())

    expect(result.status).toBe('success')
    expect(store.rowCount('fake_table')).toBe(6)
  })
})

describe('#1616.4 — les comptes s’ADDITIONNENT : lues = écrites + inchangées + rejetées', () => {
  it('tient sur un mélange insert / update / inchangé / rejeté', async () => {
    const store = new FakeTransactionalStore()

    // Un premier run pose l'état existant : k0 restera inchangé, k1 sera mis à jour.
    await runVersionedImport(
      [
        tableInput([
          { key: 'k0', value: 'stable' },
          { key: 'k1', value: 'ancien' },
        ]),
      ],
      VINTAGE,
      CHECKSUMS,
      store.deps(),
    )

    const input = tableInput(
      [
        { key: 'k0', value: 'stable' }, // inchangé
        { key: 'k1', value: 'nouveau' }, // update
        { key: 'k2', value: 'neuf' }, // insert
      ],
      /* rejected */ 4,
    )
    const result = await runVersionedImport([input], VINTAGE, CHECKSUMS, store.deps())

    expect(result.status).toBe('success')
    const report = result.tables[0]!
    expect(report.written).toBe(2) // k1 (update) + k2 (insert)
    expect(report.unchanged).toBe(1) // k0
    expect(report.rejected).toBe(4)
    expect(report.read).toBe(7) // 3 brouillons + 4 rejetées

    // L'INVARIANT — jamais déduit, toujours vérifié :
    expect(report.read).toBe(report.written + report.unchanged + report.rejected)
  })
})

describe('#1616.4 — réimporter le MÊME pack ne duplique rien et n’écrase pas une ligne inchangée', () => {
  it('un second import identique laisse le nombre de lignes STABLE et ne réécrit rien', async () => {
    const store = new FakeTransactionalStore()
    const drafts = [
      { key: 'k0', value: 'v0' },
      { key: 'k1', value: 'v1' },
    ]

    await runVersionedImport([tableInput(drafts)], VINTAGE, CHECKSUMS, store.deps())
    expect(store.rowCount('fake_table')).toBe(2)

    // Réimport BYTE-IDENTIQUE — aucune ligne ne doit se dupliquer.
    const second = await runVersionedImport([tableInput(drafts)], VINTAGE, CHECKSUMS, store.deps())
    expect(store.rowCount('fake_table')).toBe(2) // toujours 2, pas 4
    expect(second.tables[0]?.written).toBe(0) // rien n'a eu besoin d'être réécrit
    expect(second.tables[0]?.unchanged).toBe(2)
  })

  it("une ligne inchangée n'est jamais renvoyée en écriture — la correction qu'elle porterait survit", async () => {
    // Une ligne « inchangée » par construction n'entre jamais dans `toWrite` —
    // c'est `classifyUpserts` qui le garantit, vérifié ici à travers l'orchestration
    // complète plutôt qu'unitairement sur la fonction pure seule.
    const store = new FakeTransactionalStore()
    await runVersionedImport([tableInput([{ key: 'k0', value: 'valeur-corrigee' }])], VINTAGE, CHECKSUMS, store.deps())

    // Un réimport qui apporte la MÊME valeur ne doit jamais passer par `write`.
    store.failAfter(0) // toute écriture, même une seule ligne, ferait échouer le run.
    const result = await runVersionedImport(
      [tableInput([{ key: 'k0', value: 'valeur-corrigee' }])],
      VINTAGE,
      CHECKSUMS,
      store.deps(),
    )
    expect(result.status).toBe('success') // aucune écriture tentée → aucune panne déclenchée
    expect(store.committedRow('fake_table', 'k0')?.['value']).toBe('valeur-corrigee')
  })
})

describe('#1615.5 — loadPack refuse un pack invalide AVANT toute écriture', () => {
  let dir: string
  const savedKey = process.env['MARKET_MEMORY_PERSON_HASH_KEY']

  afterAll(() => {
    if (savedKey === undefined) delete process.env['MARKET_MEMORY_PERSON_HASH_KEY']
    else process.env['MARKET_MEMORY_PERSON_HASH_KEY'] = savedKey
  })

  beforeEach(() => {
    process.env['MARKET_MEMORY_PERSON_HASH_KEY'] = 'cle-de-test'
    dir = mkdtempSync(join(tmpdir(), 'market-memory-pack-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeMinimalPack(
    overrides: {
      manifest?: Record<string, unknown>
      skipFile?: string
      fileContents?: Partial<Record<string, string>>
      /** Change le compte ATTENDU d'UN fichier sans retirer celui des autres
       *  — contrairement à `manifest.expectedRowCounts`, qui REMPLACE tout
       *  l'objet (comme `manifest.checksums` le fait déjà pour les sommes). */
      expectedRowCountOverrides?: Partial<Record<string, number>>
    } = {},
  ): void {
    const dataDir = join(dir, 'data')
    mkdirSync(dataDir, { recursive: true })

    const fileContents: Record<string, string> = {
      '02_entreprises.csv': 'cle;nom\nthales;Thales\n',
      '08_esn_observees_chez_clients.csv': 'esn;esn_nom;client;client_nom;personnes\nalten;ALTEN;thales;Thales;9\n',
      '09_technos_par_entreprise.csv': 'cle_entreprise;techno;freelances\nthales;java;3\n',
      '11_anciens_esn_chez_clients.csv':
        'esn_origine;esn_nom;client_actuel;client_nom;personnes\ncapgemini;Capgemini;thales;Thales;4\n',
      '05_freelances.csv':
        'id;nom;prenom;email;telephone;linkedin;cle_entreprise;poste;competences;date_debut;date_fin;statut;esn;tjm;ville_mission\n' +
        '7;Dupont;Jean;jd@example.org;0102030405;https://linkedin.com/in/jd;thales;Data Engineer;Java,Kafka;2023-01;2024-06;freelance;ALTEN;650;Lyon\n',
      '12_rotation_freelances.csv': 'cle;rotation\nthales;0.4\n',
      '17_entreprises_ayant_cesse.csv': 'cle\n',
      '18_connecteurs_par_entreprise.csv': 'cle;freelances_multi_clients\nthales;2\n',
      ...overrides.fileContents,
    }

    const checksums: Record<string, string> = {}
    // #1615.4/#1615.5 FAIL 5 — le compte de lignes ATTENDU par défaut est
    // dérivé du contenu écrit sur disque (une ligne de données = une ligne
    // après l'entête), pour que ce témoin reste correct même si le contenu
    // d'un fichier change plus tard sans qu'on pense à retoucher le manifest.
    const expectedRowCounts: Record<string, number> = {}
    for (const file of IMPORTABLE_FILES) {
      if (file === overrides.skipFile) continue
      const content = fileContents[file] ?? ''
      writeFileSync(join(dataDir, file), content, 'utf8')
      checksums[file] = createHash('sha256').update(content, 'utf8').digest('hex')
      expectedRowCounts[file] = Math.max(content.trim().split('\n').length - 1, 0)
    }

    const manifest = {
      version: '2026.09.1',
      methodologyVersion: 'resolution-v3',
      sourceArtifactUri: 'https://drive.example/bellum-market-memory-pack',
      periodStart: '2026-01-01',
      periodEnd: '2026-08-31',
      checksums,
      expectedRowCounts: { ...expectedRowCounts, ...overrides.expectedRowCountOverrides },
      ...overrides.manifest,
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8')
  }

  it('refuse un pack sans manifest', async () => {
    mkdirSync(join(dir, 'data'), { recursive: true })
    const result = await loadPack(dir)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('manifest')
  })

  it('refuse un pack dont une somme de contrôle ne correspond pas au fichier réel', async () => {
    writeMinimalPack({ manifest: { checksums: { '02_entreprises.csv': 'somme-fausse'.padEnd(64, '0') } } })
    const result = await loadPack(dir)
    expect(result.ok).toBe(false)
  })

  it('#1615/#1616.3 — la VERSION et la PÉRIODE voyagent jusqu’aux brouillons de CHAQUE table', async () => {
    writeMinimalPack()
    const result = await loadPack(dir)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')

    expect(result.vintage).toEqual({
      datasetVersion: '2026.09.1',
      methodologyVersion: 'resolution-v3',
      sourceArtifactUri: 'https://drive.example/bellum-market-memory-pack',
      periodStart: '2026-01-01',
      periodEnd: '2026-08-31',
    })

    for (const table of result.tables) {
      expect(table.drafts.length).toBeGreaterThan(0)
      for (const draft of table.drafts) {
        expect(draft['datasetVersion']).toBe('2026.09.1')
        expect(draft['methodologyVersion']).toBe('resolution-v3')
        expect(draft['sourceFamily']).toBe('bellum_market_memory')
        expect(draft['sourceArtifactUri']).toBe('https://drive.example/bellum-market-memory-pack')
        expect(draft['periodStart']).toBe('2026-01-01')
        expect(draft['periodEnd']).toBe('2026-08-31')
        expect(typeof draft['sourceChecksum']).toBe('string')
        expect((draft['sourceChecksum'] as string).length).toBe(64)
        // Le label composé porte lui aussi la version et la période (#1615.3).
        expect(draft['corpusLabel']).toContain('2026.09.1')
      }
    }
  })

  it('#1615.5 — FAIL 3 : refuse une provenance obsolète (« *_2022 »)', async () => {
    writeMinimalPack({ manifest: { version: 'salesql_export_2022' } })
    const result = await loadPack(dir)
    expect(result.ok).toBe(false)
  })

  it('#1615.4 — refuse un manifest sans méthodologie ni URI d’artefact source', async () => {
    writeMinimalPack({ manifest: { methodologyVersion: '' } })
    expect((await loadPack(dir)).ok).toBe(false)

    rmSync(dir, { recursive: true, force: true })
    dir = mkdtempSync(join(tmpdir(), 'market-memory-pack-'))
    writeMinimalPack({ manifest: { sourceArtifactUri: '' } })
    expect((await loadPack(dir)).ok).toBe(false)
  })

  it("#1615.5 — FAIL 5 : refuse quand le compte de lignes RÉEL diverge de l'ATTENDU, sans validation", async () => {
    // Le fichier ANCRE porte réellement 1 ligne ; le manifest en attend 2 —
    // aucune écriture ne doit survenir sur cette divergence non validée.
    writeMinimalPack({ expectedRowCountOverrides: { '02_entreprises.csv': 2 } })
    const result = await loadPack(dir)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('02_entreprises.csv')
  })

  it('#1615.5 — FAIL 1/2 : refuse un fichier autorisé dont l’entête porte une colonne de PII', async () => {
    writeMinimalPack({
      fileContents: {
        '08_esn_observees_chez_clients.csv':
          'esn;esn_nom;client;client_nom;personnes;linkedin_url\nalten;ALTEN;thales;Thales;9;\n',
      },
    })
    const result = await loadPack(dir)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('linkedin_url')
  })

  it("⚠️ TÉMOIN — une colonne légitime du corpus (« client_actuel ») n'est pas prise pour un téléphone", async () => {
    // Le fichier de complétion 11 porte réellement une colonne `client_actuel`
    // dans le pack par défaut : ce test passe déjà par `writeMinimalPack()`
    // sans override, et prouve que le pack par défaut n'est jamais refusé à
    // tort par `findForbiddenPiiColumn`.
    writeMinimalPack()
    const result = await loadPack(dir)
    expect(result.ok).toBe(true)
  })

  it('la table du signal porte le checksum du fichier ANCRE (02_entreprises.csv), pas un autre', async () => {
    writeMinimalPack()
    const result = await loadPack(dir)
    if (!result.ok) throw new Error('unreachable')
    const signalTable = result.tables.find(t => t.table === 'market_company_signal')
    const esnTable = result.tables.find(t => t.table === 'market_esn_client')
    expect(signalTable?.drafts[0]?.['sourceChecksum']).not.toBe(esnTable?.drafts[0]?.['sourceChecksum'])
  })
})

describe('lot 775 — parcours anonymisés (05_freelances.csv)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'market-memory-pack-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function packWithPaths(): void {
    const dataDir = join(dir, 'data')
    mkdirSync(dataDir, { recursive: true })
    const files: Record<string, string> = {
      '02_entreprises.csv': 'cle;nom\nthales;Thales\n',
      '05_freelances.csv':
        'id;nom;prenom;email;telephone;linkedin;cle_entreprise;poste;competences;date_debut;date_fin;statut;esn;tjm;ville_mission\n' +
        '7;Dupont;Jean;jd@example.org;0102030405;https://linkedin.com/in/jd;thales;Data Engineer;Java,Kafka;2023-01;2024-06;freelance;ALTEN;650;Lyon\n',
      '08_esn_observees_chez_clients.csv': 'esn;esn_nom;client;client_nom;personnes\n',
      '09_technos_par_entreprise.csv': 'cle_entreprise;techno;freelances\n',
      '11_anciens_esn_chez_clients.csv': 'esn_origine;esn_nom;client_actuel;client_nom;personnes\n',
      '12_rotation_freelances.csv': 'cle;rotation\n',
      '17_entreprises_ayant_cesse.csv': 'cle\n',
      '18_connecteurs_par_entreprise.csv': 'cle;freelances_multi_clients\n',
    }
    const checksums: Record<string, string> = {}
    const expectedRowCounts: Record<string, number> = {}
    for (const file of IMPORTABLE_FILES) {
      const content = files[file] ?? ''
      writeFileSync(join(dataDir, file), content, 'utf8')
      checksums[file] = createHash('sha256').update(content, 'utf8').digest('hex')
      expectedRowCounts[file] = Math.max(content.trim().split('\n').length - 1, 0)
    }
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        version: '2026.11.1',
        methodologyVersion: 'resolution-v3',
        sourceArtifactUri: 'https://drive.example/pack',
        periodStart: '2026-01-01',
        periodEnd: '2026-10-31',
        checksums,
        expectedRowCounts,
      }),
      'utf8',
    )
  }

  it('SANS clé de hash, l’import refuse (no-op strict) avant toute écriture', async () => {
    packWithPaths()
    const result = await loadPack(dir, { personHashKey: '' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('MARKET_MEMORY_PERSON_HASH_KEY')
  })

  it('avec la clé : un parcours entre, et AUCUN identifiant direct n’arrive dans les brouillons', async () => {
    packWithPaths()
    const result = await loadPack(dir, { personHashKey: 'cle-de-test' })
    if (!result.ok) throw new Error(result.reason)
    const table = result.tables.find(t => t.table === 'market_person_paths')
    expect(table?.drafts).toHaveLength(1)
    expect(table?.drafts[0]).toMatchObject({ companyKey: 'thales', jobTitle: 'Data Engineer', dailyRateEur: 650 })
    const serialised = JSON.stringify(result.tables)
    for (const leaked of ['Dupont', 'Jean', 'example.org', '0102030405', 'linkedin']) {
      expect(serialised).not.toContain(leaked)
    }
  })

  it('rejouer = même résultat (clés de ligne identiques)', async () => {
    packWithPaths()
    const a = await loadPack(dir, { personHashKey: 'cle-de-test' })
    const b = await loadPack(dir, { personHashKey: 'cle-de-test' })
    if (!a.ok || !b.ok) throw new Error('pack invalide')
    const keys = (r: typeof a) => r.tables.find(t => t.table === 'market_person_paths')?.drafts.map(d => d['rowKey'])
    expect(keys(a)).toEqual(keys(b))
  })
})
