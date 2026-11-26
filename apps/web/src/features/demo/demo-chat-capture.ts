import type { ChatImageObjects } from '@bellum/contracts'

/**
 * #2433.12 (épopée #2876, lot P02 09/10) — LA CAPTURE SEMÉE DE LA SALLE DE
 * DÉMONSTRATION.
 *
 * En salle, le localiseur d'objets n'est JAMAIS appelé (`RagController.extract`,
 * aucun modèle pour un inconnu) : sans cette capture, le recadrage proposé et
 * le tableau lu ne s'y verraient jamais. L'image est DESSINÉE ici (une grille
 * de TJM fictive de l'ESN de la salle, posée sur un fond) — ses bords et sa
 * grille sont donc CONNUS par construction, pas devinés : les objets ci-dessous
 * se calculent depuis la même géométrie que le dessin.
 */

const WIDTH = 800
const HEIGHT = 600
/** La feuille posée sur le fond : ses bords sont ceux que le recadrage propose. */
const SHEET = { x: 80, y: 48, w: 640, h: 504 }
const TABLE = { x: 120, y: 160, w: 560, rowHeight: 56 }

/** #2433.5 — une case laissée vide sur la feuille reste VIDE (`null`), jamais « 0 ». */
const ROWS: readonly (readonly (string | null)[])[] = [
  ['Profil', 'TJM', 'Disponibilité'],
  ['Tech lead Java', '750 €', 'Immédiate'],
  ['Développeur React', '560 €', null],
  ['Architecte cloud', '890 €', 'Novembre'],
]

const COLUMN_WIDTHS = [240, 120, 200]

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function captureSvg(): string {
  const cells: string[] = []
  ROWS.forEach((row, rowIndex) => {
    let x = TABLE.x
    row.forEach((cell, column) => {
      const width = COLUMN_WIDTHS[column] ?? 0
      const y = TABLE.y + rowIndex * TABLE.rowHeight
      cells.push(`<rect x="${x}" y="${y}" width="${width}" height="${TABLE.rowHeight}" fill="none" stroke="#9ca3af"/>`)
      if (cell) {
        const weight = rowIndex === 0 ? ' font-weight="700"' : ''
        cells.push(
          `<text x="${x + 12}" y="${y + 35}" font-family="sans-serif" font-size="20" fill="#111827"${weight}>${escapeXml(cell)}</text>`,
        )
      }
      x += width
    })
  })
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#6b7280"/>`,
    `<rect x="${SHEET.x}" y="${SHEET.y}" width="${SHEET.w}" height="${SHEET.h}" fill="#ffffff"/>`,
    `<text x="${TABLE.x}" y="120" font-family="sans-serif" font-size="26" font-weight="700" fill="#111827">Grille de TJM — exemple</text>`,
    ...cells,
    '</svg>',
  ].join('')
}

const tableWidth = COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0)

/** La pièce jointe que la question scriptée porte : nom, image et objets mesurés par construction. */
export const DEMO_CHAT_CAPTURE: {
  name: string
  imageUrl: string
  objects: ChatImageObjects
} = {
  name: 'capture-grille-tjm.svg',
  imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(captureSvg())}`,
  objects: {
    documentBounds: { x: SHEET.x / WIDTH, y: SHEET.y / HEIGHT, w: SHEET.w / WIDTH, h: SHEET.h / HEIGHT },
    table: {
      boundingBox: {
        x: TABLE.x / WIDTH,
        y: TABLE.y / HEIGHT,
        w: tableWidth / WIDTH,
        h: (ROWS.length * TABLE.rowHeight) / HEIGHT,
      },
      rows: ROWS.map(row => [...row]),
    },
  },
}
