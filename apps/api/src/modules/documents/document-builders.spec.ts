import AdmZip from 'adm-zip'
import ExcelJS from 'exceljs'
import {
  buildMarkdownDocument,
  buildWordDocument,
  buildWorkbook,
  compactSections,
  safeFileName,
  splitLines,
} from './document-builders'
import { DEFAULT_BRAND_NAME } from '@bellum/contracts'

/**
 * Ce qui casse dans un export, c'est la mise en page — et ça ne se voit qu'à
 * l'ouverture, chez le client. D'où ces tests, qui relisent le fichier produit
 * plutôt que de vérifier qu'un buffer est non vide.
 */
describe('buildWorkbook', () => {
  async function reopen(buffer: Buffer): Promise<ExcelJS.Worksheet> {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new Error('aucune feuille')
    return sheet
  }

  it('écrit l’en-tête et les lignes dans l’ordre déclaré', async () => {
    const buffer = await buildWorkbook({
      brandName: DEFAULT_BRAND_NAME,
      sheetName: 'Contacts',
      columns: [{ header: 'Nom' }, { header: 'Société' }],
      rows: [
        ['Claire Vasseur', 'Groupe Helios'],
        ['Karim Delorme', 'NovaSanté'],
      ],
    })
    const sheet = await reopen(buffer)
    expect(sheet.name).toBe('Contacts')
    expect(sheet.getRow(1).getCell(1).value).toBe('Nom')
    expect(sheet.getRow(2).getCell(1).value).toBe('Claire Vasseur')
    expect(sheet.getRow(3).getCell(2).value).toBe('NovaSanté')
  })

  it('garde les valeurs en TEXTE — un « 01 42 » ne doit pas devenir un nombre', async () => {
    // Le grand classique irrattrapable une fois le fichier chez le client.
    const buffer = await buildWorkbook({
      brandName: DEFAULT_BRAND_NAME,
      sheetName: 'Contacts',
      columns: [{ header: 'Téléphone' }],
      rows: [['01 42 00 00 00']],
    })
    const sheet = await reopen(buffer)
    expect(sheet.getRow(2).getCell(1).value).toBe('01 42 00 00 00')
  })

  it('laisse une cellule vide VIDE plutôt que d’inventer un « N/A »', async () => {
    const buffer = await buildWorkbook({
      brandName: DEFAULT_BRAND_NAME,
      sheetName: 'Contacts',
      columns: [{ header: 'Nom' }, { header: 'Email' }],
      rows: [['Claire Vasseur', '']],
    })
    const sheet = await reopen(buffer)
    const value = sheet.getRow(2).getCell(2).value
    expect(value === null || value === '' || value === undefined).toBe(true)
    // Premier chargement d'exceljs sur un runner CI chargé : 5 s par défaut ne suffisent pas toujours.
  }, 30_000)

  it('tronque un nom de feuille trop long au lieu de faire échouer Excel', async () => {
    const buffer = await buildWorkbook({
      brandName: DEFAULT_BRAND_NAME,
      sheetName: 'Un nom de feuille beaucoup trop long pour Excel',
      columns: [{ header: 'A' }],
      rows: [['1']],
    })
    const sheet = await reopen(buffer)
    expect(sheet.name.length).toBeLessThanOrEqual(31)
  })

  it('fige la ligne d’en-tête', async () => {
    const buffer = await buildWorkbook({
      brandName: DEFAULT_BRAND_NAME,
      sheetName: 'X',
      columns: [{ header: 'A' }],
      rows: [['1']],
    })
    const sheet = await reopen(buffer)
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
  })
})

describe('buildWordDocument', () => {
  it('produit un fichier .docx reconnaissable', async () => {
    const buffer = await buildWordDocument({
      brandName: DEFAULT_BRAND_NAME,
      title: 'Plan de compte — Groupe Helios',
      sections: [{ heading: 'Lecture Bellum', paragraphs: ['Un paragraphe.'] }],
    })
    // Un .docx est un zip : la signature `PK` est le contrôle le plus direct.
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('écarte les sections entièrement vides', () => {
    // Testé sur la RÈGLE et non sur deux fichiers zip comparés : un document
    // criblé de blancs donne l'impression que la génération a échoué, et c'est
    // la règle qu'on veut protéger, pas la taille d'un binaire.
    expect(
      compactSections([
        { heading: 'Gardée', paragraphs: ['Contenu', '  '] },
        { heading: '  ', paragraphs: ['', '   '] },
        { heading: 'Titre seul', paragraphs: [] },
      ]),
    ).toEqual([
      { heading: 'Gardée', paragraphs: ['Contenu'] },
      { heading: 'Titre seul', paragraphs: [] },
    ])
  })
})

/**
 * #1955.15 — le MÊME modèle `DocSection[]` que le Word et le PDF, rendu en
 * Markdown : « exporte le fil » réclame un `.md` autant qu'un `.pdf` (registre
 * #1955), et les trois formats ne peuvent pas raconter des sections
 * différentes (même arbitrage du 03/08 que `buildPdfDocument`/`buildWordDocument`).
 */
describe('buildMarkdownDocument', () => {
  it('rend le titre en H1, le sous-titre en italique, les sections en H2', () => {
    const markdown = buildMarkdownDocument({
      title: 'Fil — Relance Helios',
      subtitle: 'Généré le 2026-09-15',
      sections: [{ heading: 'Messages', paragraphs: ['Bonjour.', 'Voici trois pistes.'] }],
    })
    expect(markdown).toContain('# Fil — Relance Helios')
    expect(markdown).toContain('_Généré le 2026-09-15_')
    expect(markdown).toContain('## Messages')
    expect(markdown).toContain('Bonjour.')
    expect(markdown).toContain('Voici trois pistes.')
  })

  it('retire les paragraphes blancs — même règle que le Word (`compactSections`)', () => {
    const markdown = buildMarkdownDocument({
      title: 'T',
      sections: [
        { heading: 'Vide', paragraphs: ['', '  '] },
        { heading: 'Pleine', paragraphs: ['Un fait.'] },
      ],
    })
    expect(markdown).not.toContain('  \n')
    expect(markdown).toContain('## Pleine')
    expect(markdown).toContain('Un fait.')
  })

  it('sans sous-titre, n’écrit aucune ligne italique orpheline', () => {
    const markdown = buildMarkdownDocument({ title: 'T', sections: [] })
    expect(markdown).not.toContain('_')
  })
})

describe('safeFileName', () => {
  it('retire accents, espaces et séparateurs', () => {
    expect(safeFileName('Société Générale — contacts', 'xlsx')).toBe('societe-generale-contacts.xlsx')
  })

  it('retombe sur un nom neutre plutôt que sur un fichier sans nom', () => {
    expect(safeFileName('///', 'docx')).toBe('export.docx')
  })
})

/** Théo D settings-espace.N5 — la signature proposée et le pied de document de l'espace, dans le Word. */
describe('buildWordDocument — signature et pied de document (N5)', () => {
  const base = {
    brandName: DEFAULT_BRAND_NAME,
    title: 'Dossier de compétences',
    sections: [{ heading: 'Profil', paragraphs: ['Data engineer senior.'] }],
  }

  it('une signature et un pied rendent un document plus riche que sans', async () => {
    const without = await buildWordDocument(base)
    const withBoth = await buildWordDocument({
      ...base,
      signature: 'L’équipe Altaïs Conseil\n04 78 92 15 60',
      footer: 'Altaïs Conseil SAS · Document confidentiel',
    })
    expect(withBoth.length).toBeGreaterThan(without.length)
  })

  it('NON : un champ null, absent ou blanc ne laisse AUCUNE trace — rien n’est inventé', async () => {
    const without = await buildWordDocument(base)
    const blank = await buildWordDocument({ ...base, signature: '  \n ', footer: '   ' })
    const nulls = await buildWordDocument({ ...base, signature: null, footer: null })
    // Le CONTENU du document (corps + pied), pas la taille du .docx : l’archive porte un horodatage dont la
    // compression varie de quelques octets d’un build à l’autre (CI PR8 23/10 : 8557 contre 8560).
    expect(wordParts(blank)).toEqual(wordParts(without))
    expect(wordParts(nulls)).toEqual(wordParts(without))
  })

  it('splitLines ne garde que les lignes écrites', () => {
    expect(splitLines(' a \n\n b ')).toEqual(['a', 'b'])
    expect(splitLines(null)).toEqual([])
    expect(splitLines(undefined)).toEqual([])
  })
})

/** Les parties XML qui portent le texte d'un .docx (corps et pieds), sans les métadonnées horodatées. */
function wordParts(docx: Buffer): Record<string, string> {
  const parts: Record<string, string> = {}
  for (const entry of new AdmZip(docx).getEntries()) {
    if (/^word\/(document|footer\d*)\.xml$/.test(entry.entryName))
      parts[entry.entryName] = entry.getData().toString('utf8')
  }
  return parts
}
