import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { compactSections, splitLines, type DocSection } from './document-builders'

/**
 * Le PDF natif — arbitrage Louis du 03/08.
 *
 * Le §5.6 demande « transforme ce compte rendu en Word ET en PDF », et le §13.4
 * le redemande deux fois (n°6, n°17). Jusqu'ici le seul chemin honnête était
 * l'export Drive, ce qui suppose un compte Google connecté : une ESN sous
 * Microsoft, ou sans suite bureautique branchée, n'avait pas de PDF du tout.
 *
 * **Un seul modèle de contenu, deux rendus.** Le PDF et le Word partent des
 * MÊMES `DocSection`. C'était l'objection au PDF natif — « il divergerait de la
 * mise en page Word » — et elle se règle en amont : deux renderers d'une seule
 * source ne peuvent pas raconter deux choses différentes. Ils peuvent être
 * espacés différemment ; ils ne peuvent pas contenir des sections différentes.
 */

const PAGE_WIDTH = 595.28 // A4 en points
const PAGE_HEIGHT = 841.89
const MARGIN = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

/**
 * Les polices standard d'un PDF encodent le **WinAnsi**, qui couvre le français
 * mais pas tout : un caractère hors jeu fait LEVER pdf-lib au moment du rendu.
 *
 * La première version décidait par une plage — « code <= 0xff, je garde ». Vu en
 * production, cette plage se trompe des deux côtés à la fois :
 *
 * - elle **jette le symbole euro** (U+20AC), que WinAnsi sait pourtant écrire.
 *   « volet digital 80 M€ » partait au client en « volet digital 80 M ». Le
 *   défaut n'est pas décoratif : c'est un montant qui change de sens en silence,
 *   dans un document qu'on envoie. Même chose pour `œ`, `™`, `†`, `Š`, `Ÿ`.
 * - elle **laisse passer les contrôles C1** (U+0080–U+009F), que WinAnsi n'a
 *   pas : ceux-là faisaient lever pdf-lib — donc pas un caractère de travers,
 *   mais un document qui ne se générait pas du tout.
 *
 * La plage est donc remplacée par le jeu réel : Latin-1 imprimable, plus le bloc
 * typographique que WinAnsi loge en 0x80–0x9F. La liste étant écrite à la main,
 * elle pourrait mentir : `pdf-builder.spec.ts` la confronte à pdf-lib lui-même.
 *
 * La règle de départ ne bouge pas : ni exception (un compte rendu qui refuse de
 * se générer parce qu'un client s'appelle « Ōkawa ») ni « ? » (qui invente un
 * caractère). Les lettres accentuées hors jeu sont décomposées et dépouillées —
 * « Ōkawa » devient « Okawa », ce qui reste le nom de la personne. Et les signes
 * sans équivalent sont TRANSCRITS (`≈` → `~`) plutôt qu'effacés : « ≈ 12 000 »
 * amputé devient « 12 000 », soit une estimation présentée comme un chiffre
 * exact.
 */

/** Le bloc que WinAnsi loge en 0x80–0x9F, là où Latin-1 n'a que des contrôles. */
const WIN_ANSI_EXTRA = new Set([
  '€', // €
  'ƒ', // ƒ
  '†', // †
  '‡', // ‡
  'ˆ', // ˆ
  '‰', // ‰
  'Š', // Š
  '‹', // ‹
  'Œ', // Œ
  'Ž', // Ž
  '˜', // ˜
  '™', // ™
  'š', // š
  '›', // ›
  'œ', // œ
  'ž', // ž
  'Ÿ', // Ÿ
])

/** Ce qu'on préfère transcrire plutôt que garder tel quel ou laisser tomber. */
const TRANSCRIPTIONS: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  ' ': ' ',
  ' ': ' ',
  '•': '-',
  '→': '->',
  '←': '<-',
  '≈': '~',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
}

function isPrintableLatin1(char: string): boolean {
  const code = char.charCodeAt(0)
  // 0x00–0x1F et 0x7F–0x9F sont des contrôles : WinAnsi ne les a pas.
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)
}

export function toPdfSafeText(input: string): string {
  return [...input]
    .map(char => {
      const transcription = TRANSCRIPTIONS[char]
      if (transcription !== undefined) return transcription
      if (isPrintableLatin1(char) || WIN_ANSI_EXTRA.has(char)) return char
      // Décomposition : « Ō » → « O » + accent combinant, dont on ne garde que
      // la lettre. Ce qui n'a pas d'équivalent latin disparaît.
      const stripped = char.normalize('NFD').replace(/[̀-ͯ]/g, '')
      return [...stripped].every(isPrintableLatin1) ? stripped : ''
    })
    .join('')
}

/**
 * Coupe un texte en lignes qui tiennent dans la largeur.
 *
 * Exportée et testée : c'est ici que se joue la lisibilité, et un texte qui
 * déborde de la page ne se voit qu'à l'ouverture chez le client. Un mot plus
 * long que la ligne (une URL) est placé seul plutôt que coupé — une URL coupée
 * ne se recolle pas.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

/** Un document PDF structuré en sections, à partir du même modèle que le Word. */
export async function buildPdfDocument(input: {
  title: string
  subtitle?: string
  sections: DocSection[]
  /** La marque de l'espace : elle voyage dans les propriétés du fichier. */
  brandName: string
  /** La signature proposée par l'espace (Réglages › Marque & documents) : placée après la dernière section. */
  signature?: string | null
  /** Le pied de document de l'espace : répété en bas de chaque page. */
  footer?: string | null
}): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setCreator(input.brandName)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let cursor = PAGE_HEIGHT - MARGIN

  const write = (text: string, font: PDFFont, size: number, gap: number): void => {
    for (const line of wrapText(toPdfSafeText(text), font, size, CONTENT_WIDTH)) {
      if (cursor - size < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        cursor = PAGE_HEIGHT - MARGIN
      }
      cursor -= size + 2
      page.drawText(line, { x: MARGIN, y: cursor, size, font, color: rgb(0.1, 0.1, 0.12) })
    }
    cursor -= gap
  }

  write(input.title, bold, 20, 8)
  if (input.subtitle?.trim()) write(input.subtitle.trim(), italic, 11, 12)

  for (const section of compactSections(input.sections)) {
    if (section.heading) write(section.heading, bold, 13, 4)
    for (const paragraph of section.paragraphs) write(paragraph, regular, 10.5, 6)
  }

  // Théo D settings-espace.N5 — la signature proposée puis le pied de document de l'espace. Un champ vide ne laisse
  // aucune ligne : ni signature par défaut, ni pied factice.
  const signatureLines = splitLines(input.signature)
  if (signatureLines.length > 0) {
    cursor -= 8
    for (const line of signatureLines) write(line, regular, 10.5, 2)
  }
  const footerText = input.footer?.trim()
  if (footerText) {
    for (const footerPage of pdf.getPages()) {
      const lines = wrapText(toPdfSafeText(footerText), regular, 8, CONTENT_WIDTH).slice(0, 2)
      lines.forEach((line, index) => {
        footerPage.drawText(line, {
          x: MARGIN,
          y: MARGIN / 2 + (lines.length - 1 - index) * 10,
          size: 8,
          font: regular,
          color: rgb(0.4, 0.4, 0.45),
        })
      })
    }
  }

  return Buffer.from(await pdf.save())
}
