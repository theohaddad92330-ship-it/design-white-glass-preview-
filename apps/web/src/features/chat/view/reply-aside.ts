import { assessReplySubstance, splitReplyBlocks, type ReplySubstanceFinding } from '@bellum/contracts'
import { dropRestatedBlockText } from '../lib/restated-block-text'
import { detailKindOf, splitWhyForDisclosure, type DetailKind } from './reply-disclosure'
import { parseStructuredReply } from './StructuredReply'

/**
 * #5044 — ce que le CORPS d'une réponse ne montre plus et que le panneau Sources du pied porte à sa place.
 * Revient sur #3763 (replis « Voir pourquoi / les sources / les limites ») et #3771 (note de substance sous
 * les cartes) en gardant leur règle : rien n'est caché, seul l'endroit change. « Ce qui manque », le verdict
 * et la prochaine action n'en font jamais partie. #5086 : les deux notes de l'IA (`reply_notes`) y entrent aussi. Fonction PURE : le corps et le pied la lisent sur le même texte.
 */
type DisclosedSection = { kind: DetailKind | 'why'; title: string; body: string }
export type ReplyAside = { sections: DisclosedSection[]; substance: ReplySubstanceFinding[]; notes: string[] }

export function extractReplyAside(text: string, replyNotes?: readonly string[]): ReplyAside {
  const segments = dropRestatedBlockText(splitReplyBlocks(text))
  const sections: DisclosedSection[] = []
  for (const segment of segments) {
    if (segment.kind !== 'text') continue
    for (const section of parseStructuredReply(segment.text)?.sections ?? []) {
      if (section.key === null) {
        const kind = detailKindOf(section.title)
        if (kind && section.body) sections.push({ kind, title: section.title, body: section.body })
      } else if (section.key === 'why') {
        const { rest } = splitWhyForDisclosure(section.body)
        if (rest) sections.push({ kind: 'why', title: section.title, body: rest })
      }
    }
  }
  const blocks = segments.flatMap(segment => (segment.kind === 'block' ? [segment.block] : []))
  // #5086 — « Contrainte retenue » (#3224) et « Précision » (#3241) arrivent déjà séparées par l'IA
  // (`context.reply_notes`) : jamais cherchées dans la prose.
  const notes = (replyNotes ?? []).filter(note => note.trim() !== '')
  return { sections, substance: assessReplySubstance(blocks), notes }
}
