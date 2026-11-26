import { replyBlockLeaves, type ReplySegment } from '@bellum/contracts'

/**
 * #4006 — UNE RÉSERVE SE DIT UNE FOIS.
 *
 * Le modèle écrit parfois la même phrase de réserve (« Cette réponse ne couvre
 * pas… ») dans la carte (`method_limit`, `main_reserve`, `not_proven`…) puis la
 * recopie en prose juste dessous. Le texte du bloc fait foi : la prose qui le
 * SUIT ne le redit pas. Ce module ne retire que des phrases IDENTIQUES (à la
 * casse, à la mise en forme et à la ponctuation près) et d'au moins
 * `MIN_CHARS` caractères — une phrase courte (« Voilà. ») n'est jamais retirée.
 * La prose qui PRÉCÈDE le premier bloc, et une réponse sans bloc, restent
 * intactes.
 */
const MIN_CHARS = 30

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[*_`#>~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SENTENCE_SPLIT = /(?<=[.!?…])\s+/u

export function dropRestatedBlockText(segments: ReplySegment[]): ReplySegment[] {
  const said = new Set<string>()
  let seenBlock = false
  const out: ReplySegment[] = []
  for (const segment of segments) {
    if (segment.kind === 'block') {
      seenBlock = true
      for (const leaf of replyBlockLeaves(segment.block)) {
        for (const sentence of leaf.split(SENTENCE_SPLIT)) {
          const key = normalize(sentence)
          if (key.length >= MIN_CHARS) said.add(key)
        }
      }
      out.push(segment)
      continue
    }
    if (segment.kind !== 'text' || !seenBlock || said.size === 0) {
      out.push(segment)
      continue
    }
    const kept = segment.text
      .split('\n')
      .map(line =>
        line
          .split(SENTENCE_SPLIT)
          .filter(sentence => !said.has(normalize(sentence)))
          .join(' '),
      )
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (kept) out.push({ kind: 'text', text: kept })
  }
  return out
}
