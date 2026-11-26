import { Document, Footer, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import ExcelJS from 'exceljs'

/**
 * Les LIVRABLES bureautiques — décision Louis du 03/08.
 *
 * Les méta-analyses réclament des fichiers, pas des tableaux à l'écran :
 * « exporte les 10 hot leads en CSV/Excel », « transforme ce compte rendu en
 * Word », « prépare un plan de compte ». L'arbitrage retenu est d'ajouter de
 * vraies bibliothèques de génération plutôt que de dépendre d'un connecteur —
 * un utilisateur sans Google Workspace doit pouvoir télécharger son fichier.
 *
 * Deux règles qui expliquent la forme de ce module :
 *
 * 1. **Aucune donnée n'est inventée ici.** Les constructeurs prennent ce qu'on
 *    leur donne et le mettent en page. Une cellule vide reste vide : un tableau
 *    de prospection où les trous ont été comblés par « N/A » se lit comme une
 *    donnée, et quelqu'un finira par l'appeler.
 * 2. **Pur, donc testable.** Ils rendent un `Buffer` sans toucher au réseau ni à
 *    la base. Ce qui casse dans un export, c'est la mise en page — et ça ne se
 *    teste que si la génération est isolée.
 */

type SheetColumn = { header: string; width?: number }

/**
 * Un classeur d'une feuille, à partir d'une grille de chaînes.
 *
 * On écrit des CHAÎNES et pas des types devinés : transformer « 01 42 » en
 * nombre 142 ou une référence en date est le grand classique des exports, et
 * c'est irrattrapable une fois le fichier chez le client.
 */
/**
 * ⚠️ `creator` / `author` porte la marque de l'ESPACE — marque blanche,
 * 01/09/2026. Ce champ VOYAGE avec le fichier : il s'affiche dans les
 * propriétés du document chez celui qui le reçoit, longtemps après que l'écran
 * a disparu, et un client envoie ce fichier à SON client. Passé et jamais lu
 * ici : ce module ne connaît ni l'espace ni le réseau.
 */
export async function buildWorkbook(input: {
  sheetName: string
  columns: SheetColumn[]
  rows: string[][]
  brandName: string
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = input.brandName
  const sheet = workbook.addWorksheet(input.sheetName.slice(0, 31) || 'Feuille 1')

  sheet.columns = input.columns.map(column => ({
    header: column.header,
    key: column.header,
    width: column.width ?? Math.min(Math.max(column.header.length + 4, 12), 48),
  }))
  sheet.getRow(1).font = { bold: true }
  // La ligne d'en-tête reste visible au défilement : un tableau de 300 lignes
  // sans en-têtes figés est illisible dès la deuxième page.
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const row of input.rows) {
    // `addRow` avec un tableau respecte l'ordre des colonnes déclarées.
    const added = sheet.addRow(row)
    added.eachCell(cell => {
      cell.alignment = { vertical: 'top', wrapText: true }
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export type DocSection = { heading: string; paragraphs: string[] }

/**
 * Nettoie les sections avant mise en page : paragraphes vides retirés, sections
 * entièrement vides écartées.
 *
 * Exporté et testé à part parce qu'un document `.docx` est un zip — comparer
 * deux fichiers produits pour vérifier qu'une section a bien disparu est un test
 * qui casse au premier changement de la bibliothèque. La RÈGLE, elle, est
 * stable : un document criblé de blancs donne l'impression que la génération a
 * échoué, même quand elle a réussi.
 */
export function compactSections(sections: DocSection[]): DocSection[] {
  return sections
    .map(section => ({
      heading: section.heading.trim(),
      paragraphs: section.paragraphs.map(text => text.trim()).filter(Boolean),
    }))
    .filter(section => section.heading || section.paragraphs.length)
}

/**
 * Un document Word structuré en sections.
 *
 * Volontairement sobre : un titre, des sections, des paragraphes. Pas de
 * couleurs ni de logo — un livrable envoyé à un client doit pouvoir être repris
 * dans SA charte, et un document trop mis en forme se reformate mal.
 *
 * Les paragraphes vides sont écartés : un document criblé de blancs donne
 * l'impression que la génération a échoué, même quand elle a réussi.
 */
export async function buildWordDocument(input: {
  title: string
  subtitle?: string
  sections: DocSection[]
  /** La marque de l'espace — voir `buildWorkbook`. */
  brandName: string
  /** La signature proposée par l'espace (Réglages › Marque & documents) : placée après la dernière section. */
  signature?: string | null
  /** Le pied de document de l'espace : répété en bas de chaque page. */
  footer?: string | null
}): Promise<Buffer> {
  const children: Paragraph[] = [new Paragraph({ text: input.title, heading: HeadingLevel.HEADING_1 })]
  if (input.subtitle?.trim()) {
    children.push(new Paragraph({ children: [new TextRun({ text: input.subtitle.trim(), italics: true })] }))
  }

  for (const section of compactSections(input.sections)) {
    if (section.heading) {
      children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }))
    }
    for (const text of section.paragraphs) children.push(new Paragraph({ text }))
  }

  // Théo D settings-espace.N5 — la signature proposée et le pied de document de l'espace. Rien n'est inventé : un
  // champ vide ne laisse AUCUNE ligne (ni signature par défaut, ni pied factice).
  const signatureLines = splitLines(input.signature)
  if (signatureLines.length > 0) {
    children.push(new Paragraph({ text: '' }))
    for (const line of signatureLines) children.push(new Paragraph({ text: line }))
  }
  const footerText = input.footer?.trim()
  const document = new Document({
    sections: [
      {
        ...(footerText
          ? {
              footers: {
                default: new Footer({
                  children: [new Paragraph({ children: [new TextRun({ text: footerText, size: 16 })] })],
                }),
              },
            }
          : {}),
        children,
      },
    ],
  })
  return Packer.toBuffer(document)
}

/** Les lignes non vides d'un texte libre (signature) — `null`/vide donne aucune ligne. */
export function splitLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

/**
 * #1955.15 — le MÊME modèle `DocSection[]` que le Word et le PDF, rendu en
 * Markdown. Même règle que `buildWordDocument` : les sections entièrement
 * vides sont déjà écartées par `compactSections`, un document criblé de blancs
 * donnant l'impression que la génération a échoué.
 */
export function buildMarkdownDocument(input: { title: string; subtitle?: string; sections: DocSection[] }): string {
  const lines: string[] = [`# ${input.title}`]
  if (input.subtitle?.trim()) lines.push('', `_${input.subtitle.trim()}_`)
  for (const section of compactSections(input.sections)) {
    if (section.heading) lines.push('', `## ${section.heading}`)
    for (const paragraph of section.paragraphs) lines.push('', paragraph)
  }
  return `${lines.join('\n')}\n`
}

/** Un nom de fichier sûr : pas d'accent, pas d'espace, pas de séparateur. */
export function safeFileName(base: string, extension: string): string {
  const slug =
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'export'
  return `${slug}.${extension}`
}
