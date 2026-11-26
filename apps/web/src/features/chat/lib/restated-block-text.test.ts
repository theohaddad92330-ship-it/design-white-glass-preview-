import { splitReplyBlocks, type ReplySegment } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { dropRestatedBlockText } from './restated-block-text'

/**
 * #4006 — « une réponse redit, sous le bloc, la phrase « Cette réponse ne couvre
 * pas… » déjà affichée au-dessus ». Le modèle écrit la réserve DANS la carte
 * (`method_limit`) puis la recopie en prose juste dessous : une seule fois.
 */
const RESERVE = 'Cette réponse ne couvre pas les filiales étrangères du groupe.'

function mapBlock(methodLimit: string): string {
  return [
    '```bellum-block',
    JSON.stringify({
      type: 'account_map',
      title: 'Cartographie',
      completeness: { level: 'partial', label: 'Partielle' },
      context: [{ kind: 'sector', label: 'Banque' }],
      framing: { origin: 'Votre portefeuille', proves: 'Le périmètre lu', not_proven: 'Aucun budget' },
      summary: { retained_count: 1, qualification: 'Un compte' },
      accounts: [
        {
          name: 'Alpha',
          status: { level: 'priority', label: 'Prioritaire' },
          proof: 'Un poste ouvert',
          caution: 'À vérifier',
          next_action: { label: 'Appeler' },
        },
      ],
      method_limit: methodLimit,
    }),
    '```',
  ].join('\n')
}

const texts = (segments: ReplySegment[]) => segments.flatMap(segment => (segment.kind === 'text' ? [segment.text] : []))

describe('dropRestatedBlockText (#4006)', () => {
  it('retire de la prose SOUS le bloc la phrase déjà écrite dans le bloc', () => {
    const segments = splitReplyBlocks(`${mapBlock(RESERVE)}\n\n${RESERVE} Dis-moi si tu veux élargir.`)
    expect(segments.some(segment => segment.kind === 'block')).toBe(true)
    expect(texts(dropRestatedBlockText(segments))).toEqual(['Dis-moi si tu veux élargir.'])
  })

  it('retire le paragraphe entier quand il ne reste que la redite, même en gras ou sans majuscule', () => {
    const segments = splitReplyBlocks(`${mapBlock(RESERVE)}\n\n**${RESERVE.toLowerCase()}**`)
    expect(texts(dropRestatedBlockText(segments))).toEqual([])
  })

  it('garde une phrase différente et une phrase courte', () => {
    const segments = splitReplyBlocks(`${mapBlock(RESERVE)}\n\nVoilà. Autre chose à dire sur le compte Alpha.`)
    expect(texts(dropRestatedBlockText(segments))).toEqual(['Voilà. Autre chose à dire sur le compte Alpha.'])
  })

  it('ne touche pas la prose AVANT le bloc, ni une réponse sans bloc', () => {
    const before = splitReplyBlocks(`${RESERVE}\n\n${mapBlock(RESERVE)}`)
    expect(texts(dropRestatedBlockText(before))).toEqual([RESERVE])
    const plain = splitReplyBlocks(RESERVE)
    expect(dropRestatedBlockText(plain)).toEqual(plain)
  })
})
