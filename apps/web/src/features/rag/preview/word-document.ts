import DOMPurify from 'dompurify'
import { attribute, partText, readArchive, textRuns } from './ooxml'

/**
 * #3803 (3803.3) — un .docx en HTML LISIBLE : titres, paragraphes, listes,
 * gras/italique, tableaux. Ni images, ni mise en page fidèle au pixel.
 *
 * ⚠️ SÉCURITÉ — deux barrières, et les deux sont nécessaires :
 *  1. le HTML est CONSTRUIT ici à partir du seul texte des runs, toujours
 *     échappé : un `<script>` écrit dans le document devient du texte ;
 *  2. il passe ENSUITE par DOMPurify ({@link sanitizeDocumentHtml}) avec une
 *     liste FERMÉE de balises et AUCUN attribut — si la barrière 1 casse un
 *     jour, la 2 tient encore. Jamais de `dangerouslySetInnerHTML` sans elle.
 */

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'u',
  'br',
  'table',
  'tbody',
  'tr',
  'td',
]

/** La seconde barrière : balises fermées, aucun attribut, aucun protocole. */
export function sanitizeDocumentHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [] })
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Un run : son texte échappé, en gras/italique/souligné s'il l'est. */
function runHtml(run: string): string {
  const text = escapeHtml(textRuns(run, 'w')) + (/<w:br\b/.test(run) ? '<br>' : '')
  if (!text) return ''
  const props = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? ''
  const on = (tag: string) => new RegExp(`<w:${tag}(?:\\s+w:val="(?!0|false)[^"]*")?\\s*/>`).test(props)
  let html = text
  if (on('u')) html = `<u>${html}</u>`
  if (on('i')) html = `<em>${html}</em>`
  if (on('b')) html = `<strong>${html}</strong>`
  return html
}

function paragraphInner(paragraph: string): string {
  return [...paragraph.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].map(match => runHtml(match[1] ?? '')).join('')
}

function headingLevel(paragraph: string): number | null {
  const style = /<w:pStyle\b[^>]*>/.exec(paragraph)?.[0]
  const value = style ? (attribute(style, 'w:val') ?? '') : ''
  const level = /^(?:heading|titre)\s*(\d)$/i.exec(value)?.[1] ?? (/^title$/i.test(value) ? '1' : null)
  return level ? Math.min(6, Math.max(1, Number(level))) : null
}

function tableHtml(table: string): string {
  const rows = [...table.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map(row => {
    const cells = [...(row[1] ?? '').matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map(cell => {
      const inner = [...(cell[1] ?? '').matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
        .map(paragraph => paragraphInner(paragraph[1] ?? ''))
        .filter(Boolean)
        .join('<br>')
      return `<td>${inner}</td>`
    })
    return `<tr>${cells.join('')}</tr>`
  })
  return `<table><tbody>${rows.join('')}</tbody></table>`
}

/** Le corps du document en HTML (non encore assaini — voir {@link docxToSafeHtml}). */
function bodyHtml(documentXml: string): string {
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(documentXml)?.[1] ?? ''
  const blocks: string[] = []
  let list: string[] = []
  const flushList = () => {
    if (list.length > 0) blocks.push(`<ul>${list.join('')}</ul>`)
    list = []
  }
  // Ordre de l'alternance : un `<w:p/>` vide d'abord, sinon il avalerait le paragraphe suivant.
  for (const match of body.matchAll(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) {
    const block = match[0]
    if (block.startsWith('<w:tbl')) {
      flushList()
      blocks.push(tableHtml(block))
      continue
    }
    const inner = paragraphInner(block)
    if (/<w:numPr>/.test(block)) {
      if (inner) list.push(`<li>${inner}</li>`)
      continue
    }
    flushList()
    if (!inner) continue
    const level = headingLevel(block)
    blocks.push(level ? `<h${level}>${inner}</h${level}>` : `<p>${inner}</p>`)
  }
  flushList()
  return blocks.join('')
}

/** Lit un .docx et rend un HTML ASSAINI, prêt à afficher. */
export function docxToSafeHtml(bytes: Uint8Array): string {
  const archive = readArchive(bytes)
  const documentXml = partText(archive, 'word/document.xml')
  if (documentXml === null) throw new Error('docx sans word/document.xml')
  return sanitizeDocumentHtml(bodyHtml(documentXml))
}
