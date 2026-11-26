import PptxGenJS from 'pptxgenjs'
import { compactSections, type DocSection } from './document-builders'

/**
 * La présentation — arbitrage Louis du 03/08 (« PPTX natif ET PDF natif »).
 *
 * Le §5.6 du rapport besoins le demande mot pour mot : « génère une présentation
 * PowerPoint à partir de ce fichier Excel », et le §13.4 le redemande sous forme
 * de requête (n°12). Jusqu'ici la bibliothèque était approuvée mais aucun écran
 * ne l'appelait — un deck sans destinataire ne se teste pas.
 *
 * La version 3 de la bibliothèque, et pas la 4 : la 4 charge ses dépendances
 * Node par import dynamique, ce que la VM de Jest refuse sans drapeau
 * expérimental. On préfère une version qui se TESTE — un générateur de fichiers
 * binaires dont on ne vérifie jamais la sortie finit toujours par rendre un zip
 * vide en silence.
 *
 * La COMPOSITION est séparée du rendu. `composeDeckSlides` décide ce qui va sur
 * quelle diapositive, et se teste ; `buildDeck` empile des zones de texte, et ne
 * décide de rien. C'est la même séparation que le rapport de pipeline : ce qui
 * porte une règle métier doit être vérifiable sans ouvrir un fichier binaire.
 */

/** Une diapositive : un titre et des puces. Rien d'autre — un deck envoyé à un
 *  client doit pouvoir être repris dans SA charte. */
type SlideSpec = { title: string; bullets: string[] }

/** Au-delà, la diapositive devient illisible en réunion. Le reste passe sur une
 *  diapositive de suite, plutôt que d'être tronqué en silence. */
const MAX_BULLETS_PER_SLIDE = 6

/**
 * Découpe des sections en diapositives.
 *
 * Trois décisions, toutes destinées à ce que le deck reste présentable :
 *
 * 1. **Une section trop longue est ÉTALÉE, jamais tronquée.** Couper à six
 *    puces et jeter le reste ferait disparaître de l'information sans le dire ;
 *    les diapositives de suite portent « (suite) » pour que le lecteur sache.
 * 2. **Les sections vides disparaissent** (`compactSections`) : une diapositive
 *    avec un titre et rien dessous se lit comme une génération ratée.
 * 3. **Une puce trop longue reste entière.** Un paragraphe de cinq lignes est
 *    laid ; un paragraphe coupé au milieu d'une phrase est faux.
 */
export function composeDeckSlides(input: { title: string; subtitle?: string; sections: DocSection[] }): SlideSpec[] {
  const slides: SlideSpec[] = []
  const cover: SlideSpec = { title: input.title.trim() || 'Présentation', bullets: [] }
  if (input.subtitle?.trim()) cover.bullets.push(input.subtitle.trim())
  slides.push(cover)

  for (const section of compactSections(input.sections)) {
    const heading = section.heading || '—'
    for (let index = 0; index < section.paragraphs.length; index += MAX_BULLETS_PER_SLIDE) {
      const chunk = section.paragraphs.slice(index, index + MAX_BULLETS_PER_SLIDE)
      slides.push({
        title: index === 0 ? heading : `${heading} (suite)`,
        bullets: chunk,
      })
    }
    // Une section réduite à son titre garde sa diapositive : elle porte une
    // intention (« Risques »), même quand le contenu est encore à écrire.
    if (section.paragraphs.length === 0) slides.push({ title: heading, bullets: [] })
  }

  return slides
}

/** Empile les diapositives composées dans un vrai fichier `.pptx`. */
export async function buildDeck(slides: readonly SlideSpec[], brandName: string): Promise<Buffer> {
  const pptx = new PptxGenJS()
  // La marque de l'espace : elle voyage dans les propriétés du fichier.
  pptx.author = brandName
  pptx.layout = 'LAYOUT_16x9'

  for (const [index, spec] of slides.entries()) {
    const slide = pptx.addSlide()
    slide.addText(spec.title, {
      x: 0.5,
      y: index === 0 ? 2.2 : 0.4,
      w: 9,
      h: index === 0 ? 1.2 : 0.8,
      fontSize: index === 0 ? 32 : 24,
      bold: true,
    })
    if (spec.bullets.length > 0) {
      slide.addText(
        spec.bullets.map(text => ({ text, options: { bullet: index === 0 ? false : true, breakLine: true } })),
        { x: 0.5, y: index === 0 ? 3.4 : 1.4, w: 9, h: 3.8, fontSize: index === 0 ? 16 : 14 },
      )
    }
  }

  // `outputType: 'nodebuffer'` rend déjà un Buffer ; le type déclaré par la
  // bibliothèque couvre aussi ses sorties navigateur, d'où la conversion.
  const output = (await pptx.write({ outputType: 'nodebuffer' })) as unknown as Uint8Array
  return Buffer.from(output)
}
