import AdmZip from 'adm-zip'
import ExcelJS from 'exceljs'

/** #3586 — bornes : une feuille, un csv ou un json ne pèse jamais plus que ça dans l'index. */
export const MAX_ROWS_PER_SHEET = 2000
/**
 * Anti zip-bomb (#3586) : 2 000 entrées au plus ; plafond par entrée supportée (25 Mo, au-delà elle est sautée et nommée) ;
 * plafond TOTAL du seul contenu supporté (200 Mo). Les images et binaires d'un zip ne comptent pour rien.
 */
export const MAX_ZIP_ENTRIES = 2000
export const MAX_ZIP_ENTRY_BYTES = 25 * 1024 * 1024
export const MAX_ZIP_SUPPORTED_BYTES = 200 * 1024 * 1024

interface ZipLimits {
  maxEntries: number
  maxEntryBytes: number
  maxSupportedBytes: number
}

const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: MAX_ZIP_ENTRIES,
  maxEntryBytes: MAX_ZIP_ENTRY_BYTES,
  maxSupportedBytes: MAX_ZIP_SUPPORTED_BYTES,
}

const TEXT_EXT = /\.(md|txt)$/i
const SUPPORTED_EXT = /\.(md|txt|docx|pdf|xlsx|csv|json|zip)$/i
const REMOTE_EXT = /\.(pdf|docx)$/i
const ZIP_MIME = new Set(['application/zip', 'application/x-zip-compressed'])
const SUPPORTED_MIME = new Set([
  'application/pdf',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ...ZIP_MIME,
])

/** Format de FICHIER binaire/texte pris en charge (les exports Google natifs sont décidés par le service). */
export function isSupportedFormat(name: string, mimeType: string): boolean {
  if (SUPPORTED_MIME.has(mimeType)) return true
  return SUPPORTED_EXT.test(name) && !mimeType.startsWith('image/') && !mimeType.startsWith('video/')
}

/** La raison, nommée, d'un fichier ignoré (jamais une erreur). */
export function ignoredReason(name: string, mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image : pas de lecture du texte des images (pas d’OCR)'
  if (mimeType.startsWith('video/')) return 'vidéo : format non lu'
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase()
  return `format non pris en charge${ext ? ` (.${ext})` : ''}`
}

interface DocumentInput {
  name: string
  bytes: Buffer
  /** Extraction PDF/docx déportée côté IA (`/rag/extract`) : octets en base64 → texte. */
  extractRemote: (fileB64: string, filename: string) => Promise<string>
  /** Bornes du zip (tests) ; défaut : les constantes `MAX_ZIP_*`. */
  zipLimits?: Partial<ZipLimits>
}

function truncationNote(unit: string, max: number): string {
  return `[… ${unit} tronquée : seules les ${max} premières lignes sont indexées]`
}

function capLines(text: string, unit: string): string {
  const lines = text.split(/\r?\n/)
  if (lines.length <= MAX_ROWS_PER_SHEET) return text
  return `${lines.slice(0, MAX_ROWS_PER_SHEET).join('\n')}\n${truncationNote(unit, MAX_ROWS_PER_SHEET)}`
}

function cellText(cell: ExcelJS.Cell): string {
  try {
    return String(cell.text ?? '')
      .replace(/\s*\n\s*/g, ' ')
      .trim()
  } catch {
    return ''
  }
}

async function xlsxToText(bytes: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const sections: string[] = []
  wb.eachSheet(sheet => {
    const lines: string[] = []
    let truncated = false
    sheet.eachRow({ includeEmpty: false }, row => {
      if (lines.length >= MAX_ROWS_PER_SHEET) {
        truncated = true
        return
      }
      const cells: string[] = []
      for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c)))
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
      if (cells.length > 0) lines.push(cells.join(' | '))
    })
    if (lines.length === 0) return
    if (truncated) lines.push(truncationNote('feuille', MAX_ROWS_PER_SHEET))
    sections.push(`Feuille : ${sheet.name}\n${lines.join('\n')}`)
  })
  return sections.join('\n\n')
}

/** Un zip se lit entrée par entrée : chaque entrée est décompressée, extraite puis relâchée (jamais le zip entier en mémoire). */
async function zipToText(input: DocumentInput): Promise<string> {
  const limits = { ...DEFAULT_ZIP_LIMITS, ...input.zipLimits }
  const zip = new AdmZip(input.bytes)
  const entries = zip.getEntries().filter(e => !e.isDirectory && !e.entryName.startsWith('__MACOSX/'))
  if (entries.length > limits.maxEntries) {
    throw new Error(`archive zip refusée : trop d’entrées (${entries.length} > ${limits.maxEntries})`)
  }
  const parts: string[] = []
  const skipped: string[] = []
  // #3586 — plus d'échec avalé : chaque entrée sans texte laisse sa raison, pour l'erreur finale.
  const unsupportedExts: string[] = []
  const failures: string[] = []
  let unsupported = 0
  let empty = 0
  let supportedBytes = 0
  for (const e of entries) {
    // Images, binaires et archives imbriquées : sautés sans rien compter.
    if (!SUPPORTED_EXT.test(e.entryName) || /\.zip$/i.test(e.entryName)) {
      unsupported++
      const ext = /\.([A-Za-z0-9]+)$/.exec(e.entryName)?.[1]?.toLowerCase()
      if (ext && !unsupportedExts.includes(ext)) unsupportedExts.push(ext)
      continue
    }
    const declared = e.header.size
    if (declared > limits.maxEntryBytes) {
      skipped.push(
        `${e.entryName} (${Math.round(declared / (1024 * 1024))} Mo > ${Math.round(limits.maxEntryBytes / (1024 * 1024))} Mo)`,
      )
      continue
    }
    supportedBytes += declared
    if (supportedBytes > limits.maxSupportedBytes) {
      throw new Error(
        `archive zip refusée : contenu supporté trop volumineux (> ${Math.round(limits.maxSupportedBytes / (1024 * 1024))} Mo)`,
      )
    }
    const data = e.getData()
    // Les tailles déclarées peuvent mentir : on recompte la taille réelle.
    if (data.length > declared || data.length > limits.maxEntryBytes) {
      throw new Error(`archive zip refusée : taille réelle de ${e.entryName} différente de la taille annoncée`)
    }
    const path = `${input.name}/${e.entryName}`
    try {
      const text = (await extractDocumentText({ ...input, name: path, bytes: data })).trim()
      if (text) parts.push(`Document : ${path}\n${text}`)
      else empty++
    } catch (error) {
      // Une entrée illisible n'invalide pas l'archive : on passe à la suivante, mais on la compte.
      failures.push(`${e.entryName} : ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (parts.length === 0) {
    const details: string[] = []
    if (unsupported > 0) {
      details.push(`${unsupported} non supportées${unsupportedExts.length > 0 ? ` (ex. .${unsupportedExts[0]})` : ''}`)
    }
    if (skipped.length > 0) details.push(`${skipped.length} trop volumineuses (${skipped.slice(0, 3).join(', ')})`)
    if (failures.length > 0) details.push(`${failures.length} en échec (première cause : ${failures[0]})`)
    if (empty > 0) details.push(`${empty} sans texte`)
    throw new Error(
      `archive sans texte exploitable : ${entries.length} entrées${details.length > 0 ? ` — ${details.join(', ')}` : ''}`,
    )
  }
  if (skipped.length > 0) parts.push(`Entrées sautées (trop volumineuses) : ${skipped.join(', ')}`)
  return parts.join('\n\n')
}

/** Texte d'un fichier de format supporté. Un zip se lit à plat (sous-documents `archive.zip/entrée`, pas d'archive imbriquée). */
export async function extractDocumentText(input: DocumentInput): Promise<string> {
  const { name, bytes } = input
  if (/\.zip$/i.test(name)) return zipToText(input)
  if (/\.xlsx$/i.test(name)) return xlsxToText(bytes)
  if (/\.json$/i.test(name)) {
    const raw = bytes.toString('utf8')
    try {
      return capLines(JSON.stringify(JSON.parse(raw), null, 2), 'json')
    } catch {
      return capLines(raw, 'json')
    }
  }
  if (/\.csv$/i.test(name)) return capLines(bytes.toString('utf8'), 'csv')
  if (TEXT_EXT.test(name)) return bytes.toString('utf8')
  if (REMOTE_EXT.test(name)) return input.extractRemote(bytes.toString('base64'), name)
  return ''
}
