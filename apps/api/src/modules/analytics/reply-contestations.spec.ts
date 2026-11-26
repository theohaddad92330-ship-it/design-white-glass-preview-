import { shapeReplyContestations, type ReplyContestationRow } from './reply-contestations'

/**
 * #2442.10 (épopée #2879, lot W9) — troisième exception NOMMÉE à c64 (décision
 * Louis 11/10/2026) : l'agrégat des contestations/corrections des réponses de
 * Laura, PAR FONCTION, jamais par personne. Fonction pure, testée seule.
 */
const row = (over: Partial<ReplyContestationRow> = {}): ReplyContestationRow => ({
  tool: 'prepare_message',
  replies: 12,
  feedbacks: 20,
  contested: 5,
  corrected: 2,
  ...over,
})

describe('shapeReplyContestations (#2442.10)', () => {
  it('rend, par fonction, des COMPTES et la part contestée des retours', () => {
    const report = shapeReplyContestations([row()], 5)
    expect(report.byTool).toEqual([
      { tool: 'prepare_message', replies: 12, feedbacks: 20, contested: 5, corrected: 2, contestedShare: 0.25 },
    ])
  })

  it('applique le plancher à la LECTURE : une fonction sous le seuil ne sort pas, et seul son nombre est dit', () => {
    const report = shapeReplyContestations(
      [row(), row({ tool: 'rare', replies: 4 }), row({ tool: 'rare2', replies: 1 })],
      5,
    )
    expect(report.byTool.map(line => line.tool)).toEqual(['prepare_message'])
    expect(report.withheldTools).toBe(2)
    expect(report.minDistinctReplies).toBe(5)
  })

  it('ne rend JAMAIS de part pour zéro retour (jamais « 0 % » d’une absence)', () => {
    const report = shapeReplyContestations([row({ feedbacks: 0, contested: 0, corrected: 0, replies: 9 })], 5)
    expect(report.byTool[0]?.contestedShare).toBeNull()
  })

  it('trie les fonctions les plus contestées d’abord, à égalité par nom', () => {
    const report = shapeReplyContestations(
      [row({ tool: 'b', contested: 2 }), row({ tool: 'a', contested: 2 }), row({ tool: 'c', contested: 9 })],
      5,
    )
    expect(report.byTool.map(line => line.tool)).toEqual(['c', 'a', 'b'])
  })

  it('la forme rendue ne porte AUCUN champ de personne, d’espace ou de contenu', () => {
    const report = shapeReplyContestations([row()], 5)
    const keys = JSON.stringify(report)
    for (const forbidden of ['user', 'workspace', 'account', 'note', 'correction_value', 'email']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})
