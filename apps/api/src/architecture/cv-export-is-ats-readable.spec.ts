import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2187.43 (épopée #2943) — l'export du dossier de compétences est
 * ATS-readable, PROUVÉ plutôt qu'affirmé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────
 * Un ATS (le logiciel qui trie les CV chez un client) sait lire du texte
 * simple, colonne unique, sections titrées — et casse ou ignore silencieusement
 * tableaux, images, colonnes multiples et zones de texte flottantes. Le
 * triage du 25/09 a trouvé la promesse « export premium et ATS-readable »
 * (§9, critère de recette n°6) non vérifiable : rien ne prouvait que l'export
 * du dossier ne PEUT PAS produire l'un de ces pièges.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Le dossier de compétences part par `cvVersionToDocSections` (cv-studio.
 * service.ts) vers `buildWordDocument`/`buildPdfDocument` (document-builders.ts
 * / pdf-builder.ts) — les MÊMES constructeurs génériques que tout autre
 * livrable bureautique. Cette garde lit leur SOURCE et vérifie qu'ils
 * n'importent, ni ne peuvent construire, aucun des éléments qu'un ATS ne sait
 * pas lire : `Table`/`ImageRun`/`Drawing` côté Word, `drawImage`/`embedPng`/
 * `embedJpg` côté PDF. Le contenu qu'ils rendent (`Paragraph`/`TextRun` d'un
 * côté, `drawText` de l'autre) est TOUJOURS du texte simple, colonne unique —
 * par construction, pas par discipline.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne rouvre pas le binaire produit (un `.docx` est un zip) : elle lit le
 * CODE qui le produit. Un contournement par une bibliothèque tierce important
 * ces mêmes primitives sous un autre nom lui échapperait.
 */
describe('l’export du dossier de compétences reste ATS-readable', () => {
  const documentBuilders = readFileSync(join(__dirname, '../modules/documents/document-builders.ts'), 'utf8')
  const pdfBuilder = readFileSync(join(__dirname, '../modules/documents/pdf-builder.ts'), 'utf8')
  const consultantsController = readFileSync(
    join(__dirname, '../modules/consultants/consultants.controller.ts'),
    'utf8',
  )

  it('le Word du dossier ne construit ni tableau, ni image, ni zone de texte flottante', () => {
    for (const forbidden of ['Table(', 'new Table', 'ImageRun(', 'Drawing(', 'TextBox']) {
      expect(documentBuilders).not.toContain(forbidden)
    }
    // Une colonne unique de paragraphes titrés — exactement ce qu'un ATS lit.
    expect(documentBuilders).toContain('new Paragraph(')
  })

  it('le PDF du dossier n’écrit jamais une image à la place du texte', () => {
    for (const forbidden of ['drawImage', 'embedPng', 'embedJpg']) {
      expect(pdfBuilder).not.toContain(forbidden)
    }
    // `drawText` embarque un VRAI objet texte extractible, jamais un pixel.
    expect(pdfBuilder).toContain('drawText')
  })

  it('le téléchargement du dossier part bien par CES constructeurs, pas par un gabarit à part', () => {
    expect(consultantsController).toContain('cvVersionToDocSections')
    expect(consultantsController).toContain('buildWordDocument')
    expect(consultantsController).toContain('buildPdfDocument')
  })
})
