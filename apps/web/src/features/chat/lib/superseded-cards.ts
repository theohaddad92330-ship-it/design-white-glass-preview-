import { splitReplyBlocks } from '@bellum/contracts'

/**
 * #3769 (recette prod 13/10) — « priorise mes comptes » puis « seulement en Occitanie » : l'affinage ACTUALISE la
 * même carte (même `card_id`), il n'en pose pas une seconde. La carte la plus récente d'un identifiant donné fait foi ;
 * les précédentes, dans les messages plus anciens, sont remplacées à l'écran par un renvoi.
 *
 * Retourne l'ensemble des clés `messageId:cardId` à remplacer. Pur : un message sans identifiant de message, ou une
 * carte sans `card_id`, n'est jamais touché ; deux cartes du MÊME message ne se remplacent pas.
 */
export function supersededCardKeys(
  messages: ReadonlyArray<{ id?: string | null; role: string; content: string }>,
): ReadonlySet<string> {
  const lastOwner = new Map<string, string>()
  const perMessage: Array<{ id: string; cardIds: string[] }> = []
  for (const message of messages) {
    // Filtre bon marché d'abord : appelé à chaque token streamé, sur le fil entier.
    if (message.role !== 'assistant' || !message.id || !message.content.includes('card_id')) continue
    const cardIds: string[] = []
    for (const segment of splitReplyBlocks(message.content)) {
      if (segment.kind === 'block' && segment.block.type === 'account_ranking' && segment.block.card_id) {
        cardIds.push(segment.block.card_id)
        lastOwner.set(segment.block.card_id, message.id)
      }
    }
    perMessage.push({ id: message.id, cardIds })
  }
  const superseded = new Set<string>()
  for (const { id, cardIds } of perMessage) {
    for (const cardId of cardIds) {
      if (lastOwner.get(cardId) !== id) superseded.add(`${id}:${cardId}`)
    }
  }
  return superseded
}
