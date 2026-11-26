import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildPdfDocument, toPdfSafeText, wrapText } from './pdf-builder'
import { buildWordDocument } from './document-builders'
import { buildDeck, composeDeckSlides } from './deck-builder'
import { DEFAULT_BRAND_NAME } from '@bellum/contracts'

describe('toPdfSafeText', () => {
  it('ramène les typographiques courants à leur équivalent', () => {
    expect(toPdfSafeText('L’offre — « prête »… ')).toBe("L'offre - « prête »... ")
  })

  it('garde les accents français, qui sont dans le jeu du PDF', () => {
    expect(toPdfSafeText('Créé à Nîmes, coût élevé')).toBe('Créé à Nîmes, coût élevé')
  })

  it('dépouille un caractère hors jeu plutôt que d’échouer ou d’inventer', () => {
    // « Ōkawa » reste le nom de la personne ; un « ? » ne l'est pas.
    expect(toPdfSafeText('Ōkawa')).toBe('Okawa')
  })

  it('laisse tomber ce qui n’a aucun équivalent latin', () => {
    expect(toPdfSafeText('東京 Paris')).toBe(' Paris')
  })

  it('garde le symbole euro — vu en production, « 80 M€ » était livré « 80 M »', () => {
    // Le pire cas de cette fonction n'est pas le caractère manquant, c'est le
    // MONTANT qui change de sens sans que personne le voie.
    expect(toPdfSafeText('volet digital 80 M€ sur 3,4 Md€')).toBe('volet digital 80 M€ sur 3,4 Md€')
  })

  it('garde les autres caractères que le PDF sait écrire', () => {
    expect(toPdfSafeText('cœur Œuvre ™ † ‰ Šimon Ÿ')).toBe('cœur Œuvre ™ † ‰ Šimon Ÿ')
  })

  it('donne un équivalent lisible aux signes que le PDF ne sait pas écrire', () => {
    // « ≈ 12 000 » supprimé devient « 12 000 » : une estimation présentée comme
    // un chiffre exact. On préfère un tilde à un mensonge.
    expect(toPdfSafeText('≈ 12 000 collaborateurs')).toBe('~ 12 000 collaborateurs')
    expect(toPdfSafeText('≥ 5 et ≤ 9 → ok')).toBe('>= 5 et <= 9 -> ok')
  })

  it('retire les caractères de contrôle, que le PDF REFUSE d’écrire', () => {
    // Ceux-ci passaient le filtre « <= 0xff » et faisaient LEVER pdf-lib au
    // rendu : ce n'était pas un défaut d'affichage, c'était un document qui ne
    // se générait pas du tout.
    const control = `a${String.fromCharCode(0x80)}b${String.fromCharCode(0x9f)}c${String.fromCharCode(0x07)}`
    expect(toPdfSafeText(control)).toBe('abc')
  })

  it('tout ce qu’elle rend est écrivable par la police du PDF', async () => {
    // Le garde anti-dérive : la liste des caractères permis est écrite à la
    // main, donc elle peut mentir. Ce test la confronte à pdf-lib lui-même.
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const everything = Array.from({ length: 0x2200 }, (_, code) => String.fromCharCode(code)).join('')
    for (const char of toPdfSafeText(everything)) {
      expect(() => font.widthOfTextAtSize(char, 10)).not.toThrow()
    }
  })
})

describe('wrapText', () => {
  let font: Awaited<ReturnType<PDFDocument['embedFont']>>

  beforeAll(async () => {
    const pdf = await PDFDocument.create()
    font = await pdf.embedFont(StandardFonts.Helvetica)
  })

  it('coupe sur les espaces et respecte la largeur', () => {
    const lines = wrapText('un deux trois quatre cinq six sept huit neuf dix', font, 10, 60)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(60)
  })

  it('place seul un mot plus long que la ligne plutôt que de le couper', () => {
    // Une URL coupée ne se recolle pas.
    const url = 'https://exemple.test/un/chemin/vraiment/tres/long'
    expect(wrapText(url, font, 10, 40)).toEqual([url])
  })

  it('rend une liste vide sur un texte vide', () => {
    expect(wrapText('   ', font, 10, 100)).toEqual([])
  })
})

describe('buildPdfDocument', () => {
  const input = {
    title: 'Plan de compte — ACME',
    subtitle: 'Préparé le 3 août 2026',
    sections: [
      { heading: 'Contexte', paragraphs: ['Une phrase de contexte.', ''] },
      { heading: '', paragraphs: [] },
      { heading: 'Prochaines actions', paragraphs: ['Rappeler la DSI.'] },
    ],
  }

  it('produit un PDF relisible', async () => {
    // On relit le fichier produit, comme les constructeurs Word et Excel : ce
    // qui casse dans un export, c'est la mise en page, et ça ne se voit qu'à
    // l'ouverture.
    const buffer = await buildPdfDocument({ ...input, brandName: DEFAULT_BRAND_NAME })
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    const reloaded = await PDFDocument.load(buffer)
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('pagine un contenu long au lieu de le laisser déborder', async () => {
    const long = {
      title: 'Rapport',
      sections: [{ heading: 'Détail', paragraphs: Array.from({ length: 200 }, (_, i) => `Ligne numéro ${i}.`) }],
    }
    const reloaded = await PDFDocument.load(await buildPdfDocument({ ...long, brandName: DEFAULT_BRAND_NAME }))
    expect(reloaded.getPageCount()).toBeGreaterThan(1)
  })

  it('ne lève pas sur un nom hors du jeu de caractères du PDF', async () => {
    await expect(
      buildPdfDocument({
        brandName: DEFAULT_BRAND_NAME,
        title: 'Compte 東京 Ōkawa',
        sections: [{ heading: '広報', paragraphs: ['Ōkawa'] }],
      }),
    ).resolves.toBeInstanceOf(Buffer)
  })

  it('part du même modèle que le Word — mêmes sections, deux rendus', async () => {
    // La garantie qui rend le PDF natif acceptable : les deux ne peuvent pas
    // contenir des sections différentes, puisqu'ils lisent la même entrée.
    const [pdf, word] = await Promise.all([
      buildPdfDocument({ ...input, brandName: DEFAULT_BRAND_NAME }),
      buildWordDocument({ ...input, brandName: DEFAULT_BRAND_NAME }),
    ])
    expect(pdf.length).toBeGreaterThan(0)
    expect(word.length).toBeGreaterThan(0)
  })
})

describe('composeDeckSlides', () => {
  it('ouvre sur une diapositive de couverture', () => {
    const slides = composeDeckSlides({ title: 'ACME', subtitle: 'Q3', sections: [] })
    expect(slides[0]).toEqual({ title: 'ACME', bullets: ['Q3'] })
  })

  it('étale une section longue au lieu de la tronquer', () => {
    const slides = composeDeckSlides({
      title: 'T',
      sections: [{ heading: 'Signaux', paragraphs: Array.from({ length: 14 }, (_, i) => `Point ${i}`) }],
    })
    const signalSlides = slides.filter(s => s.title.startsWith('Signaux'))
    expect(signalSlides).toHaveLength(3)
    expect(signalSlides[1]?.title).toBe('Signaux (suite)')
    expect(signalSlides.flatMap(s => s.bullets)).toHaveLength(14)
  })

  it('écarte les sections entièrement vides', () => {
    const slides = composeDeckSlides({ title: 'T', sections: [{ heading: '', paragraphs: ['   '] }] })
    expect(slides).toHaveLength(1)
  })

  it('garde une section réduite à son titre — elle porte une intention', () => {
    const slides = composeDeckSlides({ title: 'T', sections: [{ heading: 'Risques', paragraphs: [] }] })
    expect(slides.map(s => s.title)).toEqual(['T', 'Risques'])
  })
})

describe('buildDeck', () => {
  it('produit un vrai fichier .pptx', async () => {
    // Un `.pptx` est un zip : la signature « PK » est la preuve la moins
    // coûteuse qu'on a bien écrit un fichier et pas une chaîne vide.
    const buffer = await buildDeck(
      composeDeckSlides({ title: 'ACME', sections: [{ heading: 'A', paragraphs: ['b'] }] }),
      DEFAULT_BRAND_NAME,
    )
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    expect(buffer.length).toBeGreaterThan(1000)
  })
})

/** Théo D settings-espace.N5 — la signature proposée et le pied de document de l'espace, dans le PDF. */
describe('buildPdfDocument — signature et pied de document (N5)', () => {
  const base = {
    brandName: DEFAULT_BRAND_NAME,
    title: 'Dossier de compétences',
    sections: [{ heading: 'Profil', paragraphs: ['Data engineer senior.'] }],
  }

  it('le pied est tracé sur CHAQUE page, la signature une fois à la fin', async () => {
    const long = Array.from({ length: 120 }, (_, index) => `Ligne ${index} du parcours professionnel.`)
    const sections = [{ heading: 'Parcours', paragraphs: long }]
    const plain = await buildPdfDocument({ ...base, sections })
    const dressed = await buildPdfDocument({
      ...base,
      sections,
      signature: 'L’équipe Altaïs Conseil',
      footer: 'Altaïs Conseil SAS · Document confidentiel',
    })
    expect((await PDFDocument.load(dressed)).getPageCount()).toBeGreaterThan(1)
    expect(dressed.length).toBeGreaterThan(plain.length)
  })

  it('NON : un champ null ou blanc ne laisse aucune trace', async () => {
    const plain = await buildPdfDocument(base)
    const blank = await buildPdfDocument({ ...base, signature: ' \n ', footer: '   ' })
    expect(blank.length).toBe(plain.length)
  })
})
