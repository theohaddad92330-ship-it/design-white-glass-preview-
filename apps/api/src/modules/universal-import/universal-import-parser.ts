import { Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import type { UniversalImportFormat } from '@bellum/contracts'

/**
 * LA LECTURE EN FLUX de l'import universel — CSV (`,` `;` tabulation), XLSX, JSON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN FLUX, ET PAS `text.split('\n')`
 * ─────────────────────────────────────────────────────────────────────────────
 * L'exigence (Louis, 27/09/2026) est « n'importe quel nombre de lignes ». Le
 * fichier arrive en PARTS (upload fractionné) ; ce lecteur ne tient jamais plus
 * d'une part en mémoire pour le texte délimité et le JSON — une cellule entre
 * guillemets coupée entre deux parts, un caractère UTF-8 coupé entre deux
 * octets, un objet JSON coupé en deux : l'état traverse la frontière.
 *
 * Le XLSX est une archive ZIP : son répertoire central est À LA FIN du fichier,
 * il ne se lit pas part par part. Les parts sont donc rassemblées en UN flux,
 * et `exceljs` lit la feuille ligne par ligne (`WorkbookReader`) — la feuille
 * n'est jamais matérialisée en entier.
 *
 * ⚠️ Ce fichier ne journalise AUCUNE cellule : une donnée d'import n'entre
 * jamais dans un log.
 */

/** Ce que le lecteur rend : les en-têtes une fois, puis chaque ligne avec son numéro DANS LE FICHIER. */
export type UniversalRecordEvent =
  // #4426.4 — les feuilles d'un classeur XLSX (nom + lignes de données) et celle qui est lue.
  | { kind: 'sheets'; sheets: UniversalSheetInfo[]; selected: string }
  | { kind: 'headers'; headers: string[] }
  | { kind: 'row'; line: number; record: Record<string, string> }

/** `recognised` : les en-têtes de la feuille reconnaissent-ils les champs du type importé (#5223). */
export type UniversalSheetInfo = { name: string; rows: number; recognised: boolean; headers: string[] }

/** Les réglages de lecture d'un classeur. */
export type UniversalReadOptions = {
  /** #4426.4 — la feuille voulue par l'humain ; inconnue du classeur = choix automatique. */
  sheet?: string | null
  /** #4426.4 — les en-têtes de cette feuille reconnaissent-ils les champs du type importé ? */
  recognises?: (headers: string[]) => boolean
}

/** Un en-tête vide devient `colonne_N`, un doublon `Nom (2)` — deux colonnes ne s'écrasent jamais. */
export function uniqueHeaders(raw: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((cell, index) => {
    const base = cell.trim() || `colonne_${index + 1}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

/**
 * Le séparateur le plus fréquent de la première ligne, HORS guillemets et hors parenthèses
 * (« Tiering (A, B, C) » n'est pas trois colonnes). À égalité, `;` — l'export Excel par défaut
 * en français — gagne sur la virgule (#4890). `,` par défaut.
 */
export function detectDelimiter(firstLine: string): ',' | ';' | '\t' {
  const counts = { ';': 0, ',': 0, '\t': 0 }
  let inQuotes = false
  let depth = 0
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes
    else if (inQuotes) continue
    else if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && (char === ',' || char === ';' || char === '\t')) counts[char] += 1
  }
  const best = (Object.entries(counts) as Array<[',' | ';' | '\t', number]>).sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? best[0] : ','
}

/**
 * Le tokeniseur RFC 4180 À ÉTAT : `push` accepte un morceau de texte et rend
 * les enregistrements COMPLETS qu'il contient ; un champ entre guillemets
 * inachevé attend le morceau suivant. `end` vide ce qui reste.
 */
export class DelimitedStreamTokenizer {
  private field = ''
  private record: string[] = []
  private inQuotes = false
  /** Un `"` vu en fin de morceau dans un champ cité : `""` (échappé) ou fin de citation ? Le morceau suivant tranche. */
  private pendingQuote = false

  constructor(private readonly delimiter: string) {}

  push(text: string): string[][] {
    const out: string[][] = []
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i] as string
      if (this.pendingQuote) {
        this.pendingQuote = false
        if (char === '"') {
          this.field += '"'
          continue
        }
        this.inQuotes = false
      }
      if (this.inQuotes) {
        if (char === '"') this.pendingQuote = true
        else this.field += char
        continue
      }
      if (char === '"' && this.field.length === 0) this.inQuotes = true
      else if (char === this.delimiter) this.endField()
      else if (char === '\n') {
        this.endField()
        this.flush(out)
      } else if (char !== '\r') this.field += char
    }
    return out
  }

  end(): string[][] {
    const out: string[][] = []
    if (this.pendingQuote) this.inQuotes = false
    if (this.field.length > 0 || this.record.length > 0) {
      this.endField()
      this.flush(out)
    }
    return out
  }

  private endField(): void {
    this.record.push(this.field)
    this.field = ''
  }

  private flush(out: string[][]): void {
    const record = this.record
    this.record = []
    // Une ligne blanche n'est pas une ligne de données.
    if (record.length > 1 || (record[0] ?? '').trim() !== '') out.push(record)
  }
}

/**
 * Le décodeur : UTF-8 (BOM retiré), sinon Windows-1252 — le format d'un export
 * Excel FR. Tranché sur la PREMIÈRE part, une fois : changer d'avis au milieu
 * du fichier produirait deux encodages dans la même colonne.
 */
function pickDecoder(firstBytes: Buffer): TextDecoder {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(firstBytes, { stream: true })
    return new TextDecoder('utf-8', { ignoreBOM: false })
  } catch {
    return new TextDecoder('windows-1252')
  }
}

function toRecord(headers: readonly string[], cells: readonly string[]): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((header, index) => {
    record[header] = cells[index] ?? ''
  })
  // Des cellules AU-DELÀ des en-têtes : conservées, jamais tronquées en silence.
  for (let index = headers.length; index < cells.length; index += 1) {
    const value = cells[index] ?? ''
    if (value.trim()) record[`colonne_${index + 1}`] = value
  }
  return record
}

async function* readDelimited(parts: AsyncIterable<Buffer>): AsyncGenerator<UniversalRecordEvent> {
  let decoder: TextDecoder | null = null
  let tokenizer: DelimitedStreamTokenizer | null = null
  let buffered = ''
  let headers: string[] | null = null
  let line = 1

  const emit = function* (records: string[][]): Generator<UniversalRecordEvent> {
    for (const cells of records) {
      if (!headers) {
        headers = uniqueHeaders(cells)
        yield { kind: 'headers', headers }
        continue
      }
      line += 1
      yield { kind: 'row', line, record: toRecord(headers, cells) }
    }
  }

  for await (const part of parts) {
    decoder ??= pickDecoder(part)
    const text = decoder.decode(part, { stream: true })
    if (!tokenizer) {
      // Le séparateur se lit sur la première ligne COMPLÈTE : on attend son `\n`.
      buffered += text
      const newline = buffered.indexOf('\n')
      if (newline === -1) continue
      tokenizer = new DelimitedStreamTokenizer(detectDelimiter(buffered.slice(0, newline)))
      yield* emit(tokenizer.push(buffered))
      buffered = ''
      continue
    }
    yield* emit(tokenizer.push(text))
  }
  const tail = decoder?.decode() ?? ''
  if (!tokenizer) {
    buffered += tail
    if (!buffered.trim()) return
    tokenizer = new DelimitedStreamTokenizer(detectDelimiter(buffered.split('\n', 1)[0] ?? ''))
    yield* emit(tokenizer.push(buffered))
  } else if (tail) {
    yield* emit(tokenizer.push(tail))
  }
  yield* emit(tokenizer.end())
}

/** Une valeur JSON à plat : un objet imbriqué garde sa forme sérialisée, `null` est vide — jamais « 0 ». */
function flatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/**
 * JSON : un TABLEAU d'objets (`[{…},{…}]`) ou du NDJSON (un objet par ligne).
 * Un scanner à état découpe les objets de premier niveau sans jamais parser le
 * document entier — même discipline que le texte délimité.
 */
async function* readJson(parts: AsyncIterable<Buffer>): AsyncGenerator<UniversalRecordEvent> {
  const decoder = new TextDecoder('utf-8')
  let depth = 0
  let inString = false
  let escaped = false
  let current = ''
  let headers: string[] | null = null
  let line = 1

  const handle = function* (objectText: string): Generator<UniversalRecordEvent> {
    const parsed: unknown = JSON.parse(objectText)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (!headers) {
      headers = entries.map(([key]) => key)
      yield { kind: 'headers', headers }
    }
    line += 1
    const record: Record<string, string> = {}
    for (const [key, value] of entries) record[key] = flatValue(value)
    yield { kind: 'row', line, record }
  }

  const scan = function* (text: string): Generator<UniversalRecordEvent> {
    for (const char of text) {
      if (depth > 0) current += char
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') inString = true
      else if (char === '{') {
        if (depth === 0) current = '{'
        depth += 1
      } else if (char === '}') {
        depth -= 1
        if (depth === 0) yield* handle(current)
      }
    }
  }

  for await (const part of parts) yield* scan(decoder.decode(part, { stream: true }))
  yield* scan(decoder.decode())
  if (!headers) yield { kind: 'headers', headers: [] }
}

/** Une cellule XLSX en texte : date → `AAAA-MM-JJ`, lien → son texte, formule → son résultat. */
function xlsxCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map(run => run.text).join('')
    if ('text' in value) return String(value.text)
    if ('result' in value) return xlsxCellText(value.result as ExcelJS.CellValue)
    if ('error' in value) return ''
  }
  return String(value)
}

/**
 * Le lecteur en flux d'exceljs ne pose `model` qu'en lisant `xl/workbook.xml`.
 * Un zip range ses entrées dans l'ordre qu'il veut : quand une feuille arrive
 * AVANT ce fichier, exceljs lit `this.model.sheets` sur `undefined` et plante
 * (CI du 01/10). Un modèle vide d'avance ne change rien au cas nominal — il est
 * remplacé dès que `xl/workbook.xml` est lu — et seul le NOM de la feuille est
 * perdu dans le cas inverse, ce dont l'import ne se sert pas.
 */
export function openXlsxStreamReader(parts: AsyncIterable<Buffer>): ExcelJS.stream.xlsx.WorkbookReader {
  const source = Readable.from(parts)
  // #4426.4 — unzipper émet « fin » dès que l'archive est parsée, alors que ses dernières entrées attendent encore
  // dans son tampon quand la boucle d'exceljs (`iterateStream`) l'a mis en pause pour lire une feuille ; elle sort sur
  // « fin » et perd l'entrée finale (`workbook.xml` : feuilles nommées « Sheet2 », une fois sur quatre sous charge).
  // Le flux du zip n'est plus mis en pause : ses entrées s'empilent dans la boucle, que l'analyse elle-même freine
  // (unzipper n'avance qu'une fois l'entrée en cours lue).
  const pipe = source.pipe.bind(source)
  source.pipe = (destination, options) => {
    ;(destination as unknown as { pause(): unknown }).pause = () => destination
    return pipe(destination, options)
  }
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(source, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    // `cache` et non `ignore` : c'est le FORMAT de la cellule qui dit qu'un nombre est une date.
    styles: 'cache',
    worksheets: 'emit',
  })
  // Même cause pour `properties` (lu par chaque feuille pour `date1904`) : sans
  // `xl/workbook.xml` encore lu, on garde le calendrier 1900, celui par défaut d'Excel.
  const primed = reader as unknown as {
    model?: { sheets?: unknown[] }
    properties?: { model?: { date1904?: boolean } }
  }
  primed.model ??= { sheets: [] }
  primed.properties ??= { model: {} }
  // CI du 02/10 : exceljs lit une feuille dès qu'il tient `sharedStrings` ET
  // `workbookRels` ; si `xl/styles.xml` vient APRÈS dans l'archive, une date
  // sort en numéro de série (« 46292 »). Tant que les styles ne sont pas lus,
  // `workbookRels` se dit absent : exceljs range alors la feuille en fichier
  // temporaire et la lit en fin d'archive, styles connus.
  // #4426.4 — même garde pour `xl/workbook.xml` : exceljs ne donne son NOM (et son
  // identifiant) à une feuille qu'en le lisant. Lue avant lui, elle s'appelait
  // « Feuille N » : « listecampagnes » introuvable, la feuille demandée jamais
  // reconnue — le choix de l'onglet dépendait de l'ordre des entrées du zip.
  const deferred = reader as unknown as {
    workbookRels?: unknown
    _parseStyles(entry: unknown): Promise<void>
    _parseWorkbook(entry: unknown): Promise<void>
  }
  const parseStyles = deferred._parseStyles.bind(reader)
  const parseWorkbook = deferred._parseWorkbook.bind(reader)
  let stylesRead = false
  let workbookRead = false
  let workbookRels: unknown
  Object.defineProperty(reader, 'workbookRels', {
    configurable: true,
    get: () => (stylesRead && workbookRead ? workbookRels : undefined),
    set: (value: unknown) => {
      workbookRels = value
    },
  })
  deferred._parseStyles = async entry => {
    await parseStyles(entry)
    stylesRead = true
  }
  deferred._parseWorkbook = async entry => {
    await parseWorkbook(entry)
    workbookRead = true
  }
  return reader
}

type XlsxCandidate = {
  name: string
  headers: string[]
  rows: Array<{ line: number; record: Record<string, string> }>
  recognised: boolean
}

async function* readXlsx(
  parts: AsyncIterable<Buffer>,
  options: UniversalReadOptions,
): AsyncGenerator<UniversalRecordEvent> {
  const reader = openXlsxStreamReader(parts)
  const sheets: UniversalSheetInfo[] = []
  // #4426.4 — au plus DEUX feuilles en mémoire : celle qu'on lit et la meilleure vue jusqu'ici.
  let best: XlsxCandidate | null = null
  let index = 0
  for await (const sheet of reader) {
    index += 1
    const name = (sheet as { name?: string }).name?.trim() || `Feuille ${index}`
    const wanted = options.sheet === name
    const current: XlsxCandidate = { name, headers: [], rows: [], recognised: false }
    let hasHeaders = false
    let count = 0
    for await (const row of sheet) {
      // `row.values` est indexé à partir de 1 (l'index 0 est vide).
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      const cells = Array.from({ length: values.length }, (_, cell) => xlsxCellText(values[cell]))
      if (cells.every(cellText => !cellText.trim())) continue
      if (!hasHeaders) {
        hasHeaders = true
        current.headers = uniqueHeaders(cells)
        current.recognised = options.recognises?.(current.headers) ?? false
        continue
      }
      count += 1
      current.rows.push({ line: row.number, record: toRecord(current.headers, cells) })
    }
    sheets.push({ name, rows: count, recognised: current.recognised, headers: current.headers })
    if (hasHeaders && beats(current, best, options.sheet ?? null, wanted)) best = current
  }
  yield { kind: 'sheets', sheets, selected: best?.name ?? sheets[0]?.name ?? '' }
  if (!best) {
    yield { kind: 'headers', headers: [] }
    return
  }
  yield { kind: 'headers', headers: best.headers }
  for (const row of best.rows) yield { kind: 'row', line: row.line, record: row.record }
}

/**
 * #4426.4 — la feuille choisie par l'humain gagne ; sinon une feuille qui RECONNAÎT ses colonnes bat une qui ne
 * les reconnaît pas, puis la plus fournie, puis la première du classeur. « Synthèse » (un titre, un tableau croisé)
 * ne reconnaît aucune colonne entreprise : elle n'est jamais retenue.
 */
function beats(
  candidate: XlsxCandidate,
  best: XlsxCandidate | null,
  requested: string | null,
  wanted: boolean,
): boolean {
  if (wanted) return true
  if (!best) return true
  if (requested !== null && best.name === requested) return false
  if (candidate.recognised !== best.recognised) return candidate.recognised
  // Le seul cas où le nombre de lignes tranche : deux feuilles à égalité de reconnaissance.
  return candidate.recognised && candidate.rows.length > best.rows.length
}

/** Le point d'entrée : un flux d'évènements, quel que soit le format. */
export function readUniversalRecords(
  parts: AsyncIterable<Buffer>,
  format: UniversalImportFormat,
  options: UniversalReadOptions = {},
): AsyncGenerator<UniversalRecordEvent> {
  if (format === 'xlsx') return readXlsx(parts, options)
  if (format === 'json') return readJson(parts)
  return readDelimited(parts)
}
