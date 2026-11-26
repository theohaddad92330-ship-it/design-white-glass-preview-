import AdmZip from 'adm-zip'
import { demoPdf } from './demo-stored-files'

/**
 * #3803 (3803.7) — LES ORIGINAUX DES DOCUMENTS DE LA SALLE DE DÉMONSTRATION.
 *
 * La salle refuse le dépôt (un visiteur n'y laisse rien) : sans original semé,
 * la visionneuse — grille à onglets, PDF, docx, slides — ne s'y verrait
 * jamais, et le prospect découvrirait en réunion un aperçu en texte brut.
 *
 * Chaque fichier est FABRIQUÉ ici, depuis le contenu FICTIF déjà semé pour le
 * document (`DEMO_RAG_DOCUMENTS`) — jamais un fichier binaire versionné, jamais
 * un second contenu qui divergerait du texte que Laura cite. Petits (quelques
 * Ko), et au format Office réel (OOXML) : un visiteur qui télécharge
 * l'original l'ouvre dans son tableur ou son traitement de texte.
 */
export type DemoDocumentSourceFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'md'

const CONTENT_TYPES: Readonly<Record<DemoDocumentSourceFormat, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  md: 'text/markdown',
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function zip(entries: Record<string, string>): Buffer {
  const archive = new AdmZip()
  for (const [path, xml] of Object.entries(entries)) archive.addFile(path, Buffer.from(xml, 'utf8'))
  return archive.toBuffer()
}

function relationships(rels: ReadonlyArray<{ id: string; type: string; target: string }>): string {
  return `${XML_HEADER}<Relationships xmlns="${REL_NS}">${rels
    .map(rel => `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"/>`)
    .join('')}</Relationships>`
}

/* ------------------------------------------------------------------ */
/*  Classeur — un onglet par feuille                                   */
/* ------------------------------------------------------------------ */

function columnName(index: number): string {
  let name = ''
  let rest = index + 1
  while (rest > 0) {
    const remainder = (rest - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    rest = Math.floor((rest - 1) / 26)
  }
  return name
}

function sheetXml(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  const body = rows
    .map((cells, rowIndex) => {
      const ref = (column: number) => `${columnName(column)}${rowIndex + 1}`
      const xmlCells = cells
        .map((value, column) =>
          /^-?\d+(\.\d+)?$/.test(value)
            ? `<c r="${ref(column)}"><v>${value}</v></c>`
            : `<c r="${ref(column)}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
        )
        .join('')
      return `<row r="${rowIndex + 1}">${xmlCells}</row>`
    })
    .join('')
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

/** Un nom d'onglet admis par un tableur : 31 caractères, sans `: \ / ? * [ ]`. */
function sheetName(label: string): string {
  return (
    label
      .replace(/[:\\/?*[\]]/g, ' ')
      .slice(0, 31)
      .trim() || 'Feuille'
  )
}

export function demoXlsx(sheets: ReadonlyArray<{ name: string; rows: ReadonlyArray<ReadonlyArray<string>> }>): Buffer {
  const main = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
  const entries: Record<string, string> = {
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${main}.sheet.main+xml"/>${sheets
      .map(
        (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="${main}.worksheet+xml"/>`,
      )
      .join('')}</Types>`,
    '_rels/.rels': relationships([{ id: 'rId1', type: `${DOC_REL}/officeDocument`, target: 'xl/workbook.xml' }]),
    'xl/workbook.xml': `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${DOC_REL}"><sheets>${sheets
      .map(
        (sheet, index) =>
          `<sheet name="${escapeXml(sheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': relationships(
      sheets.map((_, index) => ({
        id: `rId${index + 1}`,
        type: `${DOC_REL}/worksheet`,
        target: `worksheets/sheet${index + 1}.xml`,
      })),
    ),
  }
  sheets.forEach((sheet, index) => {
    entries[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet.rows)
  })
  return zip(entries)
}

/* ------------------------------------------------------------------ */
/*  Document Word — un titre, des paragraphes, une liste               */
/* ------------------------------------------------------------------ */

export function demoDocx(input: { title: string; paragraphs: readonly string[]; bullets: readonly string[] }): Buffer {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const run = (text: string) => `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
  const body = [
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run(input.title)}</w:p>`,
    ...input.paragraphs.map(text => `<w:p>${run(text)}</w:p>`),
    ...input.bullets.map(
      text =>
        `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`,
    ),
  ].join('')
  return zip({
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
    '_rels/.rels': relationships([{ id: 'rId1', type: `${DOC_REL}/officeDocument`, target: 'word/document.xml' }]),
    'word/_rels/document.xml.rels': relationships([
      { id: 'rId1', type: `${DOC_REL}/numbering`, target: 'numbering.xml' },
    ]),
    'word/numbering.xml': `${XML_HEADER}<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    'word/document.xml': `${XML_HEADER}<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
  })
}

/* ------------------------------------------------------------------ */
/*  Présentation — une diapositive par bloc, notes comprises           */
/* ------------------------------------------------------------------ */

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'

function shape(id: number, placeholder: 'title' | 'body', lines: readonly string[]): string {
  const paragraphs = lines
    .map(line => `<a:p><a:r><a:rPr lang="fr-FR"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`)
    .join('')
  const ph = placeholder === 'title' ? '<p:ph type="title"/>' : '<p:ph idx="1"/>'
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${placeholder} ${id}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs || '<a:p/>'}</p:txBody></p:sp>`
}

function spTree(shapes: string): string {
  return `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld>`
}

const THEME = `${XML_HEADER}<a:theme xmlns:a="${A}" name="Bellum"><a:themeElements><a:clrScheme name="Bellum"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="4F46E5"/></a:accent1><a:accent2><a:srgbClr val="0EA5E9"/></a:accent2><a:accent3><a:srgbClr val="10B981"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4><a:accent5><a:srgbClr val="EF4444"/></a:accent5><a:accent6><a:srgbClr val="8B5CF6"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="Bellum"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Bellum"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

export function demoPptx(
  slides: ReadonlyArray<{ title: string; body: readonly string[]; notes: readonly string[] }>,
): Buffer {
  const pml = 'application/vnd.openxmlformats-officedocument.presentationml'
  const master = `${XML_HEADER}<p:sldMaster xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${DOC_REL}">${spTree('')}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`
  const layout = `${XML_HEADER}<p:sldLayout xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${DOC_REL}" type="obj">${spTree('')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  const entries: Record<string, string> = {
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${pml}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${pml}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${pml}.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides
      .map(
        (slide, index) =>
          `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="${pml}.slide+xml"/>${
            slide.notes.length > 0
              ? `<Override PartName="/ppt/notesSlides/notesSlide${index + 1}.xml" ContentType="${pml}.notesSlide+xml"/>`
              : ''
          }`,
      )
      .join('')}</Types>`,
    '_rels/.rels': relationships([{ id: 'rId1', type: `${DOC_REL}/officeDocument`, target: 'ppt/presentation.xml' }]),
    'ppt/presentation.xml': `${XML_HEADER}<p:presentation xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${DOC_REL}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides
      .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`)
      .join(
        '',
      )}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': relationships([
      { id: 'rId1', type: `${DOC_REL}/slideMaster`, target: 'slideMasters/slideMaster1.xml' },
      ...slides.map((_, index) => ({
        id: `rId${index + 2}`,
        type: `${DOC_REL}/slide`,
        target: `slides/slide${index + 1}.xml`,
      })),
      { id: `rId${slides.length + 2}`, type: `${DOC_REL}/theme`, target: 'theme/theme1.xml' },
    ]),
    'ppt/slideMasters/slideMaster1.xml': master,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': relationships([
      { id: 'rId1', type: `${DOC_REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: `${DOC_REL}/theme`, target: '../theme/theme1.xml' },
    ]),
    'ppt/slideLayouts/slideLayout1.xml': layout,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': relationships([
      { id: 'rId1', type: `${DOC_REL}/slideMaster`, target: '../slideMasters/slideMaster1.xml' },
    ]),
    'ppt/theme/theme1.xml': THEME,
  }
  slides.forEach((slide, index) => {
    const n = index + 1
    entries[`ppt/slides/slide${n}.xml`] =
      `${XML_HEADER}<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${DOC_REL}">${spTree(shape(2, 'title', [slide.title]) + shape(3, 'body', slide.body))}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
    const slideRels = [{ id: 'rId1', type: `${DOC_REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' }]
    if (slide.notes.length > 0) {
      slideRels.push({ id: 'rId2', type: `${DOC_REL}/notesSlide`, target: `../notesSlides/notesSlide${n}.xml` })
      entries[`ppt/notesSlides/notesSlide${n}.xml`] =
        `${XML_HEADER}<p:notes xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${DOC_REL}">${spTree(shape(2, 'body', slide.notes))}</p:notes>`
      entries[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] = relationships([
        { id: 'rId1', type: `${DOC_REL}/slide`, target: `../slides/slide${n}.xml` },
      ])
    }
    entries[`ppt/slides/_rels/slide${n}.xml.rels`] = relationships(slideRels)
  })
  return zip(entries)
}

/* ------------------------------------------------------------------ */
/*  Du contenu semé au fichier                                         */
/* ------------------------------------------------------------------ */

/** Le contenu tel que l'extraction pptx le rend (`[Diapositive N]`, `[Notes]`) → des diapositives. */
function slidesFromExtractedText(content: string) {
  const slides: Array<{ title: string; body: string[]; notes: string[] }> = []
  let inNotes = false
  for (const line of content.split('\n')) {
    if (/^\[Diapositive \d+\]$/.test(line.trim())) {
      slides.push({ title: '', body: [], notes: [] })
      inNotes = false
      continue
    }
    if (line.trim() === '[Notes]') {
      inNotes = true
      continue
    }
    const current = slides[slides.length - 1]
    if (!current || !line.trim()) continue
    if (inNotes) current.notes.push(line)
    else if (!current.title) current.title = line
    else current.body.push(line)
  }
  return slides
}

/**
 * Le fichier ORIGINAL d'un document semé, fabriqué depuis son contenu.
 * `units` (#3750.8) = un onglet par morceau ; sinon une seule feuille.
 */
export function demoDocumentSourceFile(input: {
  format: DemoDocumentSourceFormat
  title: string
  content: string
  units?: ReadonlyArray<{ label: string; content: string }>
}): { bytes: Buffer; contentType: string } {
  const lines = input.content.split('\n').filter(line => line.trim().length > 0)
  const tabbed = (text: string) =>
    text
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.split('\t'))
  const bytes = (() => {
    switch (input.format) {
      case 'pdf':
        return demoPdf(input.title, lines)
      case 'docx':
        return demoDocx({ title: lines[0] ?? input.title, paragraphs: lines.slice(1, 2), bullets: lines.slice(2) })
      case 'xlsx':
        return demoXlsx(
          input.units && input.units.length > 0
            ? input.units.map(unit => ({ name: unit.label, rows: tabbed(unit.content) }))
            : [{ name: 'Feuille 1', rows: tabbed(input.content) }],
        )
      case 'pptx':
        return demoPptx(slidesFromExtractedText(input.content))
      case 'csv':
      case 'md':
        return Buffer.from(input.content, 'utf8')
    }
  })()
  return { bytes, contentType: CONTENT_TYPES[input.format] }
}
