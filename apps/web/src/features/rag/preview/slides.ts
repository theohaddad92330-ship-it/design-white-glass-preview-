import { attribute, partText, readArchive, relationships, resolvePath, textRuns } from './ooxml'

/**
 * #3803 (3803.3) — un .pptx, une CARTE par diapositive : titre, corps, notes,
 * dans l'ordre de la présentation. Un rendu fidèle au pixel n'est PAS promis
 * (décision tranchée dans #3803) — c'est le texte de chaque slide, rangé.
 */
export type Slide = { title: string; body: string[]; notes: string[] }

/** Les paragraphes d'une forme (`<p:sp>`), un par `<a:p>`, vides écartés. */
function paragraphs(shape: string): string[] {
  return [...shape.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
    .map(match => textRuns(match[1] ?? match[2] ?? '', 'a').trim())
    .filter(Boolean)
}

function isTitleShape(shape: string): boolean {
  const placeholder = /<p:ph\b[^>]*>/.exec(shape)?.[0]
  const type = placeholder ? attribute(placeholder, 'type') : null
  return type === 'title' || type === 'ctrTitle'
}

function slideContent(xml: string): { title: string; body: string[] } {
  let title = ''
  const body: string[] = []
  for (const match of xml.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g)) {
    const shape = match[1] ?? ''
    const lines = paragraphs(shape)
    if (!title && isTitleShape(shape)) title = lines.join(' ')
    else body.push(...lines)
  }
  return { title, body }
}

/** Les notes d'une diapositive : le corps du placeholder de notes, jamais le numéro de slide. */
function notesContent(xml: string | null): string[] {
  if (!xml) return []
  const notes: string[] = []
  for (const match of xml.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g)) {
    const shape = match[1] ?? ''
    const placeholder = /<p:ph\b[^>]*>/.exec(shape)?.[0]
    const type = placeholder ? attribute(placeholder, 'type') : null
    if (type === 'sldNum' || type === 'sldImg' || type === 'hdr' || type === 'ftr' || type === 'dt') continue
    notes.push(...paragraphs(shape))
  }
  return notes
}

/** Lit un .pptx : une carte par diapositive, dans l'ordre de `presentation.xml`. */
export function parsePptx(bytes: Uint8Array): Slide[] {
  const archive = readArchive(bytes)
  const presentation = partText(archive, 'ppt/presentation.xml') ?? ''
  const rels = relationships(partText(archive, 'ppt/_rels/presentation.xml.rels'))
  const slides: Slide[] = []
  for (const match of presentation.matchAll(/<p:sldId\b[^>]*>/g)) {
    const relId = attribute(match[0], 'r:id')
    const target = relId ? rels.get(relId) : undefined
    if (!target) continue
    const path = resolvePath('ppt', target)
    const xml = partText(archive, path)
    if (xml === null) continue
    const fileName = path.split('/').pop() ?? ''
    const slideRels = relationships(partText(archive, `ppt/slides/_rels/${fileName}.rels`))
    const notesTarget = [...slideRels.values()].find(value => value.includes('notesSlide'))
    const notesXml = notesTarget ? partText(archive, resolvePath('ppt/slides', notesTarget)) : null
    slides.push({ ...slideContent(xml), notes: notesContent(notesXml) })
  }
  return slides
}
