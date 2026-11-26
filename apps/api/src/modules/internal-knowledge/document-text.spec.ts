import AdmZip from 'adm-zip'
import ExcelJS from 'exceljs'
import { chunkText } from './text-chunker'
import { normalizeText } from './text-normalize'
import {
  extractDocumentText,
  ignoredReason,
  isSupportedFormat,
  MAX_ROWS_PER_SHEET,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_SUPPORTED_BYTES,
} from './document-text'

/** #3586 — formats pris en charge après le 1er passage réel en prod. */
const remote = jest.fn(async (_b64: string, name: string) => `PDF:${name}`)

beforeEach(() => remote.mockClear())

describe('normalizeText (#3586 — octets nuls rejetés par Postgres)', () => {
  it('retire \\u0000 et les contrôles sauf \\n \\t, remplace un surrogate isolé', () => {
    const out = normalizeText('a\u0000b\u0007c\td\ne\r\nf\uD800g\uDC00h​i')
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\u0000|\u0007/)
    expect(out).toContain('\t')
    expect(out).toContain('\n')
    expect(out).toBe('abc\td\ne\nf�g�h​i')
  })

  it('garde une paire de surrogates valide (emoji)', () => {
    expect(normalizeText('ok 😀')).toBe('ok 😀')
  })

  it('chunkText rend des chunks sans octet nul ni surrogate isolé, même coupés au milieu d’une paire', () => {
    const chunks = chunkText(`x\u0000${'😀'.repeat(1200)}\uD800`, 1000)
    for (const c of chunks) {
      expect(c).not.toContain('\u0000')
      expect(c).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    }
  })
})

describe('isSupportedFormat / ignoredReason', () => {
  it.each(['a.xlsx', 'a.csv', 'a.json', 'a.zip', 'a.md', 'a.txt', 'a.pdf', 'a.docx'])('%s est pris en charge', n => {
    expect(isSupportedFormat(n, 'application/octet-stream')).toBe(true)
  })

  it('une image reste ignorée, avec sa raison nommée', () => {
    expect(isSupportedFormat('a.png', 'image/png')).toBe(false)
    expect(ignoredReason('a.png', 'image/png')).toMatch(/image/i)
    expect(ignoredReason('a.mp4', 'video/mp4')).toMatch(/vid/i)
  })
})

describe('extractDocumentText', () => {
  const run = (name: string, bytes: Buffer, zipLimits?: Parameters<typeof extractDocumentText>[0]['zipLimits']) =>
    extractDocumentText({ name, bytes, extractRemote: remote, zipLimits })

  it('csv et md/txt : texte brut', async () => {
    expect(await run('a.csv', Buffer.from('a,b\n1,2'))).toBe('a,b\n1,2')
    expect(await run('a.md', Buffer.from('# T'))).toBe('# T')
  })

  it('csv : borné en lignes, et le dit', async () => {
    const rows = Array.from({ length: MAX_ROWS_PER_SHEET + 5 }, (_, i) => `r${i},x`).join('\n')
    const out = await run('big.csv', Buffer.from(rows))
    expect(out.split('\n').filter(l => l.startsWith('r')).length).toBe(MAX_ROWS_PER_SHEET)
    expect(out).toMatch(/tronqu/i)
  })

  it('json : indenté joliment', async () => {
    expect(await run('a.json', Buffer.from('{"a":[1,2]}'))).toBe(JSON.stringify({ a: [1, 2] }, null, 2))
  })

  it('json invalide : texte brut conservé', async () => {
    expect(await run('a.json', Buffer.from('{pas du json'))).toBe('{pas du json')
  })

  it('xlsx : une section « Feuille : nom » par feuille, en-tête + lignes', async () => {
    const wb = new ExcelJS.Workbook()
    const s1 = wb.addWorksheet('Tarifs')
    s1.addRow(['Profil', 'TJM'])
    s1.addRow(['Dev', 550])
    wb.addWorksheet('Vide')
    const s3 = wb.addWorksheet('Autre')
    s3.addRow(['k'])
    const bytes = Buffer.from(await wb.xlsx.writeBuffer())
    const out = await run('t.xlsx', bytes)
    expect(out).toContain('Feuille : Tarifs')
    expect(out).toContain('Profil | TJM')
    expect(out).toContain('Dev | 550')
    expect(out).toContain('Feuille : Autre')
  })

  it('xlsx : feuille tronquée à MAX_ROWS_PER_SHEET, avec mention', async () => {
    const wb = new ExcelJS.Workbook()
    const s = wb.addWorksheet('Gros')
    for (let i = 0; i < MAX_ROWS_PER_SHEET + 10; i++) s.addRow([`v${i}`])
    const out = await run('g.xlsx', Buffer.from(await wb.xlsx.writeBuffer()))
    expect(out).toMatch(/tronqu/i)
    expect(out).toContain(`v${MAX_ROWS_PER_SHEET - 1}`)
    expect(out).not.toContain(`v${MAX_ROWS_PER_SHEET + 5}\n`)
    // Écrire puis relire un classeur de MAX_ROWS_PER_SHEET+10 lignes dépasse 5 s sur un runner CI chargé (rouge du 05/10, PR #3617).
  }, 30_000)

  it('pdf : délégué à l’extraction IA', async () => {
    expect(await run('m.pdf', Buffer.from('%PDF'))).toBe('PDF:m.pdf')
    expect(remote).toHaveBeenCalledTimes(1)
  })

  it('zip : chaque entrée supportée = sous-document « archive.zip/entrée », le reste ignoré', async () => {
    const zip = new AdmZip()
    zip.addFile('dossier/note.md', Buffer.from('Bonjour'))
    zip.addFile('data.json', Buffer.from('{"x":1}'))
    zip.addFile('doc.pdf', Buffer.from('%PDF'))
    zip.addFile('logo.png', Buffer.from('png'))
    zip.addFile('vide.txt', Buffer.from(''))
    const out = await run('archive.zip', zip.toBuffer())
    expect(out).toContain('archive.zip/dossier/note.md')
    expect(out).toContain('Bonjour')
    expect(out).toContain('archive.zip/data.json')
    expect(out).toContain('PDF:archive.zip/doc.pdf')
    expect(out).not.toContain('logo.png')
  })

  it('zip : trop d’entrées → erreur nette (anti zip-bomb)', async () => {
    const zip = new AdmZip()
    for (let i = 0; i < MAX_ZIP_ENTRIES + 1; i++) zip.addFile(`f${i}.txt`, Buffer.from('x'))
    await expect(run('many.zip', zip.toBuffer())).rejects.toThrow(/entrées/)
  })

  it('zip : les bornes par défaut sont 2 000 entrées, 25 Mo par entrée, 200 Mo de texte supporté', () => {
    expect(MAX_ZIP_ENTRIES).toBe(2000)
    expect(MAX_ZIP_ENTRY_BYTES).toBe(25 * 1024 * 1024)
    expect(MAX_ZIP_SUPPORTED_BYTES).toBe(200 * 1024 * 1024)
  })

  it('zip : les images et binaires ne comptent pas dans le plafond total', async () => {
    const zip = new AdmZip()
    zip.addFile('photo1.png', Buffer.alloc(5000, 1))
    zip.addFile('photo2.jpg', Buffer.alloc(5000, 2))
    zip.addFile('note.txt', Buffer.from('petit'))
    const out = await run('imgs.zip', zip.toBuffer(), { maxSupportedBytes: 1000 })
    expect(out).toContain('petit')
  })

  it('zip : une entrée supportée plus grosse que le plafond par entrée est sautée et nommée', async () => {
    const zip = new AdmZip()
    zip.addFile('gros.txt', Buffer.alloc(3000, 'a'))
    zip.addFile('ok.txt', Buffer.from('visible'))
    const out = await run('s.zip', zip.toBuffer(), { maxEntryBytes: 1000 })
    expect(out).toContain('visible')
    expect(out).toMatch(/sautées.*gros\.txt/)
  })

  it('zip : contenu supporté total au-delà de la borne → erreur nette (anti zip-bomb)', async () => {
    const zip = new AdmZip()
    for (let i = 0; i < 5; i++) zip.addFile(`f${i}.txt`, Buffer.alloc(1000, 'a'))
    await expect(run('bomb.zip', zip.toBuffer(), { maxSupportedBytes: 3500 })).rejects.toThrow(/volumineux/)
  })

  // #3586 — un zip sans texte ne dit plus « document vide » : il nomme ce qu'il a trouvé.
  it('zip tout-image : erreur détaillée (entrées, non supportées avec extension)', async () => {
    const zip = new AdmZip()
    zip.addFile('a.png', Buffer.from('x'))
    zip.addFile('b.png', Buffer.from('y'))
    zip.addFile('c.jpg', Buffer.from('z'))
    await expect(run('imgs.zip', zip.toBuffer())).rejects.toThrow(
      /archive sans texte exploitable : 3 entrées — 3 non supportées \(ex\. \.png\)/,
    )
  })

  it('zip : une entrée en échec d’extraction est comptée avec sa première cause', async () => {
    const zip = new AdmZip()
    zip.addFile('scan.pdf', Buffer.from('%PDF'))
    zip.addFile('logo.png', Buffer.from('png'))
    const failing = async (): Promise<string> => {
      throw new Error('HTTP 422 : Fichier trop volumineux')
    }
    await expect(extractDocumentText({ name: 'e.zip', bytes: zip.toBuffer(), extractRemote: failing })).rejects.toThrow(
      /2 entrées — 1 non supportées \(ex\. \.png\), 1 en échec \(première cause : .*HTTP 422/,
    )
  })

  it('zip mixte : une entrée en échec n’empêche pas d’indexer les autres', async () => {
    const zip = new AdmZip()
    zip.addFile('scan.pdf', Buffer.from('%PDF'))
    zip.addFile('note.md', Buffer.from('lisible'))
    zip.addFile('logo.png', Buffer.from('png'))
    const failing = async (): Promise<string> => {
      throw new Error('boom')
    }
    const out = await extractDocumentText({ name: 'm.zip', bytes: zip.toBuffer(), extractRemote: failing })
    expect(out).toContain('lisible')
  })

  it('zip imbriqué : non rouvert', async () => {
    const inner = new AdmZip()
    inner.addFile('a.txt', Buffer.from('secret'))
    const zip = new AdmZip()
    zip.addFile('inner.zip', inner.toBuffer())
    zip.addFile('b.txt', Buffer.from('visible'))
    const out = await run('o.zip', zip.toBuffer())
    expect(out).toContain('visible')
    expect(out).not.toContain('secret')
  })
})
