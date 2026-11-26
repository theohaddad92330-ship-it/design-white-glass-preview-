import AdmZip from 'adm-zip'
import { extensionMatchesFileSignature } from '@bellum/contracts'
import { DEMO_RAG_DOCUMENTS } from './demo-dataset'
import { demoDocumentSourceFile } from './demo-document-files'

/** #3803 (3803.7) — les originaux de la salle sont de VRAIS fichiers, fabriqués depuis le contenu semé. */
describe('demoDocumentSourceFile (#3803)', () => {
  const entry = (bytes: Buffer, path: string) => new AdmZip(bytes).readAsText(path)

  it('un classeur à onglets : un onglet par morceau, cellules lues dans le contenu semé', () => {
    const { bytes, contentType } = demoDocumentSourceFile({
      format: 'xlsx',
      title: 'Classeur',
      content: '',
      units: [
        { label: '01 · Positionnement', content: 'Cible\tMessage\nDSI\tSobre' },
        { label: '02 · Preuves', content: 'Preuve\tChiffre\nDétection\t4' },
      ],
    })
    expect(contentType).toContain('spreadsheetml')
    expect(extensionMatchesFileSignature('xlsx', bytes)).toBe(true)
    const workbook = entry(bytes, 'xl/workbook.xml')
    expect(workbook.match(/<sheet /g)).toHaveLength(2)
    expect(workbook).toContain('01 · Positionnement')
    expect(entry(bytes, 'xl/worksheets/sheet2.xml')).toContain('<v>4</v>')
  })

  it('un pptx : une diapositive par bloc `[Diapositive N]`, notes comprises', () => {
    const { bytes } = demoDocumentSourceFile({
      format: 'pptx',
      title: 'Trame',
      content: '[Diapositive 1]\nTitre A\n[Diapositive 2]\nTitre B\nCorps B\n[Notes]\nNote B',
    })
    expect(entry(bytes, 'ppt/presentation.xml').match(/<p:sldId /g)).toHaveLength(2)
    expect(entry(bytes, 'ppt/slides/slide2.xml')).toContain('Corps B')
    expect(entry(bytes, 'ppt/notesSlides/notesSlide2.xml')).toContain('Note B')
  })

  it('un docx : un titre de niveau 1, puis une liste', () => {
    const { bytes } = demoDocumentSourceFile({
      format: 'docx',
      title: 'Offre',
      content: 'Titre\nIntro\nPoint 1\nPoint 2',
    })
    const document = entry(bytes, 'word/document.xml')
    expect(document).toContain('w:val="Heading1"')
    expect(document.match(/<w:numPr>/g)).toHaveLength(2)
  })

  it('la salle sème au moins un original de CHAQUE format de la visionneuse', () => {
    const formats = new Set(DEMO_RAG_DOCUMENTS.flatMap(document => (document.source ? [document.source.format] : [])))
    expect([...formats].sort()).toEqual(['csv', 'docx', 'md', 'pdf', 'pptx', 'xlsx'])
    // 3803.4 — et au moins un document SANS original, pour montrer « original non conservé ».
    expect(DEMO_RAG_DOCUMENTS.some(document => !document.source)).toBe(true)
  })
})
