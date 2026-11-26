import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseCsv, parseXlsx } from './spreadsheet'
import { parsePptx } from './slides'
import { docxToSafeHtml, sanitizeDocumentHtml } from './word-document'

// `new Uint8Array(…)` : sous jsdom, `TextEncoder` rend un tableau d'un AUTRE royaume,
// que fflate (`instanceof Uint8Array`) prendrait pour un dossier — un navigateur n'a qu'un royaume.
const zip = (parts: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, new Uint8Array(strToU8(xml))])))

const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

describe('#3803 (3803.2) — parseXlsx', () => {
  const workbook = zip({
    'xl/workbook.xml': `<workbook ${R}><sheets><sheet name="Campagnes" sheetId="1" r:id="rId1"/><sheet name="Budget &amp; suivi" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    'xl/sharedStrings.xml': `<sst><si><t>Compte</t></si><si><r><t>Ca</t></r><r><t>nal</t></r></si></sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>SNCF</t></is></c><c r="B3"><v>42</v></c></row></sheetData></worksheet>`,
    'xl/worksheets/sheet2.xml': `<worksheet><sheetData><row r="1"><c r="A1" t="b"><v>1</v></c></row></sheetData></worksheet>`,
  })

  it('rend les onglets DANS L’ORDRE du classeur, noms décodés', () => {
    const sheets = parseXlsx(workbook)
    expect(sheets.map(sheet => sheet.name)).toEqual(['Campagnes', 'Budget & suivi'])
  })

  it('garde chaque cellule sous SA colonne, lignes creuses comprises', () => {
    const [first] = parseXlsx(workbook)
    expect(first?.rows).toEqual([['Compte', '', 'Canal'], [], ['SNCF', '42']])
  })
})

describe('#3803 — parseCsv', () => {
  it('devine le séparateur `;` et respecte les guillemets', () => {
    const [sheet] = parseCsv('Nom;Note\n"Dupont; Jean";"il a dit ""oui"""\n')
    expect(sheet?.rows).toEqual([
      ['Nom', 'Note'],
      ['Dupont; Jean', 'il a dit "oui"'],
    ])
  })
})

describe('#3803 (3803.3) — docxToSafeHtml', () => {
  const docx = (body: string) =>
    zip({ 'word/document.xml': `<w:document xmlns:w="w"><w:body>${body}</w:body></w:document>` })

  it('rend les titres et les listes', () => {
    const html = docxToSafeHtml(
      docx(
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Offre</w:t></w:r></w:p>' +
          '<w:p/><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Gras</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Point 1</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Point 2</w:t></w:r></w:p>',
      ),
    )
    expect(html).toBe('<h1>Offre</h1><p><strong>Gras</strong></p><ul><li>Point 1</li><li>Point 2</li></ul>')
  })

  it('un `<script>` écrit DANS le document reste du texte, jamais un élément', () => {
    const html = docxToSafeHtml(docx('<w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p>'))
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('&lt;script&gt;')
  })

  it('la seconde barrière retire script, gestionnaires et liens, même si la première cédait', () => {
    const html = sanitizeDocumentHtml(
      '<p onclick="x()">a<script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">b</a></p>',
    )
    expect(html).toBe('<p>ab</p>')
  })
})

describe('#3803 (3803.3) — parsePptx', () => {
  it('une carte par diapositive, dans l’ordre de la présentation, notes comprises', () => {
    const slide = (title: string, body: string) =>
      `<p:sld><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`
    const pptx = zip({
      'ppt/presentation.xml': `<p:presentation ${R}><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`,
      'ppt/_rels/presentation.xml.rels': `<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>`,
      'ppt/slides/slide1.xml': slide('Deux', 'Corps deux'),
      'ppt/slides/slide2.xml': slide('Un', 'Corps un'),
      'ppt/slides/_rels/slide2.xml.rels': `<Relationships><Relationship Id="rId1" Target="../notesSlides/notesSlide2.xml"/></Relationships>`,
      'ppt/notesSlides/notesSlide2.xml': `<p:notes><p:sp><p:txBody><a:p><a:r><a:t>Insister</a:t></a:r></a:p></p:txBody></p:sp></p:notes>`,
    })
    expect(parsePptx(pptx)).toEqual([
      { title: 'Un', body: ['Corps un'], notes: ['Insister'] },
      { title: 'Deux', body: ['Corps deux'], notes: [] },
    ])
  })
})
