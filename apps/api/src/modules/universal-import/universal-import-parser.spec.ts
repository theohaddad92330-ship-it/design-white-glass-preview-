import ExcelJS from 'exceljs'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import {
  DelimitedStreamTokenizer,
  detectDelimiter,
  openXlsxStreamReader,
  readUniversalRecords,
  uniqueHeaders,
  type UniversalRecordEvent,
} from './universal-import-parser'

/** Découpe un texte en parts de `size` OCTETS — coupe volontairement au milieu des caractères. */
async function* partsOf(bytes: Buffer, size: number): AsyncGenerator<Buffer> {
  for (let offset = 0; offset < bytes.length; offset += size) yield bytes.subarray(offset, offset + size)
}

async function collect(events: AsyncIterable<UniversalRecordEvent>) {
  let headers: string[] = []
  const rows: Array<{ line: number; record: Record<string, string> }> = []
  for await (const event of events) {
    if (event.kind === 'headers') headers = event.headers
    else if (event.kind === 'row') rows.push({ line: event.line, record: event.record })
  }
  return { headers, rows }
}

describe('import universel — lecteur en flux', () => {
  it.each([
    [',', 'Nom,Email\nAda,ada@x.io\n'],
    [';', 'Nom;Email\nAda;ada@x.io\n'],
    ['\t', 'Nom\tEmail\nAda\tada@x.io\n'],
  ])('lit le séparateur « %s »', async (_delim, text) => {
    const { headers, rows } = await collect(readUniversalRecords(partsOf(Buffer.from(text), 1_000), 'csv'))
    expect(headers).toEqual(['Nom', 'Email'])
    expect(rows).toEqual([{ line: 2, record: { Nom: 'Ada', Email: 'ada@x.io' } }])
  })

  it('ne se laisse pas tromper par un séparateur ENTRE guillemets', () => {
    expect(detectDelimiter('"Dupont, Jean";"DSI, Groupe";Mail')).toBe(';')
  })

  it("#4890 — à égalité, `;` (export Excel français) l'emporte sur la virgule d'un en-tête non cité", () => {
    expect(detectDelimiter('Entreprise;Tiering (A, B, C);Secteur')).toBe(';')
    expect(detectDelimiter('Entreprise;Tiering (A, B);Secteur')).toBe(';')
  })

  it('un champ cité, un « "" » échappé et un saut de ligne survivent à une coupure de part à CHAQUE octet', async () => {
    const text = 'Nom;Note\n"Ada ""la comtesse""";"ligne 1\nligne 2"\nBabbage;ok\n'
    const { rows } = await collect(readUniversalRecords(partsOf(Buffer.from(text), 1), 'csv'))
    expect(rows.map(row => row.record)).toEqual([
      { Nom: 'Ada "la comtesse"', Note: 'ligne 1\nligne 2' },
      { Nom: 'Babbage', Note: 'ok' },
    ])
  })

  it('un caractère UTF-8 coupé entre deux parts n’est pas corrompu ; le BOM est retiré', async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Prénom\nHélène\n')])
    const { headers, rows } = await collect(readUniversalRecords(partsOf(bytes, 3), 'csv'))
    expect(headers).toEqual(['Prénom'])
    expect(rows[0]?.record).toEqual({ Prénom: 'Hélène' })
  })

  it('un export Windows-1252 (Excel FR) est décodé, pas remplacé par des �', async () => {
    const bytes = Buffer.from([0x4e, 0x6f, 0x6d, 0x0a, 0x48, 0xe9, 0x6c, 0xe8, 0x6e, 0x65, 0x0a]) // Nom\nHélène\n
    const { rows } = await collect(readUniversalRecords(partsOf(bytes, 1_000), 'csv'))
    expect(rows[0]?.record).toEqual({ Nom: 'Hélène' })
  })

  it('des cellules au-delà des en-têtes sont CONSERVÉES, jamais tronquées', async () => {
    const { rows } = await collect(readUniversalRecords(partsOf(Buffer.from('A,B\n1,2,3\n'), 100), 'csv'))
    expect(rows[0]?.record).toEqual({ A: '1', B: '2', colonne_3: '3' })
  })

  it('deux en-têtes identiques ne s’écrasent pas ; un en-tête vide est nommé', () => {
    expect(uniqueHeaders(['Nom', 'Nom', ''])).toEqual(['Nom', 'Nom (2)', 'colonne_3'])
  })

  it('10 000 lignes en parts de 4 Ko : toutes lues, dans l’ordre, sans plafond', async () => {
    const lines = ['Nom;Email']
    for (let i = 0; i < 10_000; i += 1) lines.push(`Personne ${i};p${i}@exemple.test`)
    let count = 0
    let last: Record<string, string> | null = null
    for await (const event of readUniversalRecords(partsOf(Buffer.from(lines.join('\r\n')), 4_096), 'csv')) {
      if (event.kind !== 'row') continue
      count += 1
      last = event.record
    }
    expect(count).toBe(10_000)
    expect(last).toEqual({ Nom: 'Personne 9999', Email: 'p9999@exemple.test' })
  })

  it('le tokeniseur NE rend PAS un enregistrement inachevé avant `end`', () => {
    const tokenizer = new DelimitedStreamTokenizer(',')
    expect(tokenizer.push('a,"b')).toEqual([])
    expect(tokenizer.push('c"\n')).toEqual([['a', 'bc']])
    expect(tokenizer.end()).toEqual([])
  })

  it('JSON : un tableau d’objets coupé à chaque octet ; imbriqué sérialisé ; null vide', async () => {
    const text = JSON.stringify([
      { nom: 'Ada', meta: { niveau: 3 }, vide: null },
      { nom: 'Grace "Amazing"', meta: null, vide: 0 },
    ])
    const { headers, rows } = await collect(readUniversalRecords(partsOf(Buffer.from(text), 1), 'json'))
    expect(headers).toEqual(['nom', 'meta', 'vide'])
    expect(rows.map(row => row.record)).toEqual([
      { nom: 'Ada', meta: '{"niveau":3}', vide: '' },
      { nom: 'Grace "Amazing"', meta: '', vide: '0' },
    ])
  })

  it('JSON : NDJSON (un objet par ligne)', async () => {
    const { rows } = await collect(readUniversalRecords(partsOf(Buffer.from('{"a":"1"}\n{"a":"2"}\n'), 5), 'json'))
    expect(rows.map(row => row.record['a'])).toEqual(['1', '2'])
  })

  // CI du 01/10 : `TypeError: Cannot read properties of undefined (reading 'sheets')`.
  // Le lecteur en flux d'exceljs ne connaît `model` qu'après `xl/workbook.xml` ;
  // quand l'archive range une feuille AVANT ce fichier (ordre libre dans un zip),
  // il plante. Le lecteur que l'on ouvre doit tenir sans dépendre de cet ordre.
  it('XLSX : le lecteur tient quand une feuille précède xl/workbook.xml dans l’archive', () => {
    const reader = openXlsxStreamReader((async function* () {})()) as unknown as {
      model?: { sheets?: unknown[] }
      properties?: { model?: unknown }
    }
    expect(Array.isArray(reader.model?.sheets)).toBe(true)
    expect(reader.properties?.model).toBeDefined()
  })

  // CI du 02/10 (#3535) : « Arrivée » lue « 46292 » au lieu de « 2026-09-27 ».
  // exceljs lit une feuille AUSSITÔT qu'il a les rels et les chaînes partagées ;
  // quand `xl/styles.xml` vient APRÈS la feuille dans l'archive (ordre libre),
  // le format qui dit « date » n'est pas encore connu. La feuille doit attendre
  // les styles.
  it('XLSX : une feuille n’est jamais lue avant xl/styles.xml', async () => {
    const reader = openXlsxStreamReader((async function* () {})()) as unknown as {
      workbookRels?: unknown[]
      sharedStrings?: unknown[]
      _parseStyles(entry: Readable): Promise<void>
      _parseWorkbook(entry: Readable): Promise<void>
    }
    reader.sharedStrings = []
    reader.workbookRels = [{ Target: 'worksheets/sheet1.xml' }]
    // Rels et chaînes lues, styles pas encore : exceljs doit différer la feuille.
    expect(reader.workbookRels).toBeUndefined()
    await reader._parseStyles(
      Readable.from([
        Buffer.from(
          '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/></styleSheet>',
        ),
      ]),
    )
    // #4426.4 — styles lus, `xl/workbook.xml` pas encore : la feuille attend encore (son NOM en dépend).
    expect(reader.workbookRels).toBeUndefined()
    await reader._parseWorkbook(
      Readable.from([
        Buffer.from('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>'),
      ]),
    )
    expect(reader.workbookRels).toEqual([{ Target: 'worksheets/sheet1.xml' }])
  })

  it('XLSX : première feuille, dates en ISO, lignes vides sautées', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Contacts')
    sheet.addRow(['Nom', 'Arrivée'])
    sheet.addRow(['Ada', new Date(Date.UTC(2026, 8, 27))])
    sheet.addRow([])
    sheet.addRow(['Grace', 'n/a'])
    workbook.addWorksheet('Autre').addRow(['NE PAS LIRE'])
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
    const { headers, rows } = await collect(readUniversalRecords(partsOf(bytes, 700), 'xlsx'))
    expect(headers).toEqual(['Nom', 'Arrivée'])
    expect(rows.map(row => row.record)).toEqual([
      { Nom: 'Ada', Arrivée: '2026-09-27' },
      { Nom: 'Grace', Arrivée: 'n/a' },
    ])
  })

  // #4426.4 — un classeur de tiering : « Synthèse » (titre + croisé), le tableau des comptes, « Supprimées ».
  async function tieringWorkbook(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    const synthese = workbook.addWorksheet('Synthèse')
    synthese.addRow(['Tiering 2026-2027'])
    synthese.addRow(['Tier', 'Nombre'])
    for (const tier of ['A', 'B', 'C', 'D']) synthese.addRow([tier, 10])
    const comptes = workbook.addWorksheet('Tiering 2026-2027')
    comptes.addRow(['Nom de la société', 'domain', 'Tiering (A, B, C)'])
    comptes.addRow(['Acme', 'acme.example', 'A'])
    comptes.addRow(['Globex', 'globex.example', 'B'])
    workbook.addWorksheet('Supprimées').addRow(['Initech'])
    return Buffer.from(await workbook.xlsx.writeBuffer())
  }
  const recognisesCompany = (headers: string[]) => headers.some(header => /soci[eé]t[eé]|entreprise/i.test(header))

  // #4426.4 — réécrit l'archive avec ses entrées dans un autre ordre (le contenu ne change pas).
  async function reorderedArchive(bytes: Buffer, rank: (path: string) => number): Promise<Buffer> {
    const requireFromExcel = createRequire(require.resolve('exceljs'))
    type Zip = {
      files: Record<string, { dir: boolean; async(kind: 'nodebuffer'): Promise<Buffer> }>
      file(path: string, content: Buffer): void
      generateAsync(options: { type: 'nodebuffer'; compression: 'DEFLATE' }): Promise<Buffer>
    }
    const JSZip = requireFromExcel('jszip') as (new () => Zip) & { loadAsync(bytes: Buffer): Promise<Zip> }
    const source = await JSZip.loadAsync(bytes)
    const paths = Object.keys(source.files).filter(path => !source.files[path]!.dir)
    paths.sort((a, b) => rank(a) - rank(b))
    const target = new JSZip()
    for (const path of paths) target.file(path, await source.files[path]!.async('nodebuffer'))
    return target.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  }

  // #4426.4 — le pack de Julien : la sélection de l'onglet ne dépend pas de l'ordre des entrées du zip.
  it.each([
    [
      'rels, chaînes et styles, puis feuilles, puis workbook.xml',
      (path: string) => (path === 'xl/workbook.xml' ? 2 : /xl\/worksheets\/sheet\d+\.xml$/.test(path) ? 1 : 0),
    ],
    ['workbook.xml en dernier', (path: string) => (path === 'xl/workbook.xml' ? 1 : 0)],
    ['workbook.xml en premier', (path: string) => (path === 'xl/workbook.xml' ? 0 : 1)],
    ['feuilles avant tout le reste', (path: string) => (/xl\/worksheets\/sheet\d+\.xml$/.test(path) ? 0 : 1)],
    ['styles et chaînes partagées en dernier', (path: string) => (/styles|sharedStrings/.test(path) ? 1 : 0)],
  ])('#4426.4 XLSX : même onglet retenu, noms intacts — %s', async (_label, rank) => {
    const archive = await reorderedArchive(await tieringWorkbook(), rank)
    const events: UniversalRecordEvent[] = []
    for await (const event of readUniversalRecords(partsOf(archive, 700), 'xlsx', { recognises: recognisesCompany })) {
      events.push(event)
    }
    const sheets = events.find(event => event.kind === 'sheets')
    expect(sheets).toMatchObject({ selected: 'Tiering 2026-2027' })
    expect(sheets && 'sheets' in sheets ? sheets.sheets.map(sheet => sheet.name).sort() : []).toEqual([
      'Supprimées',
      'Synthèse',
      'Tiering 2026-2027',
    ])
    const rows = events.filter(event => event.kind === 'row')
    expect(rows.map(row => ('record' in row ? row.record['Nom de la société'] : null))).toEqual(['Acme', 'Globex'])
  })

  // #4426.4 — unzipper annonce « fin » dès que l'archive est parsée, alors que ses dernières entrées attendent encore
  // dans le tampon d'un flux que la boucle d'exceljs met en pause : `workbook.xml`, dernier du zip, était perdu une
  // fois sur quatre (noms « Sheet2 »), et seulement quand le lecteur était plus lent que l'analyse.
  it('#4426.4 XLSX : workbook.xml, dernière entrée du zip, n’est jamais perdu quand le lecteur est lent', async () => {
    const archive = await reorderedArchive(await tieringWorkbook(), path =>
      path === 'xl/workbook.xml' ? 2 : /xl\/worksheets\/sheet\d+\.xml$/.test(path) ? 1 : 0,
    )
    const selected: string[] = []
    for (let run = 0; run < 40; run += 1) {
      for await (const event of readUniversalRecords(partsOf(archive, 700), 'xlsx', {
        recognises: recognisesCompany,
      })) {
        if (event.kind === 'sheets') selected.push(event.selected)
      }
    }
    expect(selected).toEqual(Array.from({ length: 40 }, () => 'Tiering 2026-2027'))
  })

  it('#4426.4 XLSX : expose les feuilles et retient celle qui reconnaît une colonne entreprise', async () => {
    const events: UniversalRecordEvent[] = []
    for await (const event of readUniversalRecords(partsOf(await tieringWorkbook(), 700), 'xlsx', {
      recognises: recognisesCompany,
    })) {
      events.push(event)
    }
    const sheets = events.find(event => event.kind === 'sheets')
    expect(sheets).toEqual({
      kind: 'sheets',
      selected: 'Tiering 2026-2027',
      sheets: [
        { name: 'Synthèse', rows: 5, recognised: false, headers: expect.any(Array) },
        { name: 'Tiering 2026-2027', rows: 2, recognised: true, headers: expect.any(Array) },
        { name: 'Supprimées', rows: 0, recognised: false, headers: expect.any(Array) },
      ],
    })
    const rows = events.filter(event => event.kind === 'row')
    expect(rows.map(row => (row.kind === 'row' ? row.record['Nom de la société'] : ''))).toEqual(['Acme', 'Globex'])
  })

  it('#4426.4 XLSX : la feuille « Synthèse » n’est jamais retenue (elle ne reconnaît aucune colonne entreprise)', async () => {
    const { headers } = await collect(
      readUniversalRecords(partsOf(await tieringWorkbook(), 700), 'xlsx', { recognises: recognisesCompany }),
    )
    expect(headers).not.toContain('Nombre')
    expect(headers).toEqual(['Nom de la société', 'domain', 'Tiering (A, B, C)'])
  })

  it('#4426.4 XLSX : une feuille choisie par l’humain l’emporte sur le choix automatique', async () => {
    const { headers } = await collect(
      readUniversalRecords(partsOf(await tieringWorkbook(), 700), 'xlsx', {
        recognises: recognisesCompany,
        sheet: 'Synthèse',
      }),
    )
    expect(headers).toEqual(['Tiering 2026-2027'])
  })
})
