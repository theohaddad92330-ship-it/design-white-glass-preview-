import type { DailyBriefing } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildTodayTiles } from './today-tiles'

const briefing = (over: Record<string, unknown>): DailyBriefing =>
  ({
    actions: [],
    mail: { state: 'ready', positiveReplies: [], unread: [], awaitingReply: [] },
    discoverAlerts: [],
    ...over,
  }) as unknown as DailyBriefing

const action = (kinds: string[]) => ({ preparedArtifacts: kinds.map(kind => ({ kind })) })

describe('buildTodayTiles', () => {
  it('ne fait aucune tuile d’une absence : rien à compter, rien à montrer', () => {
    expect(buildTodayTiles(briefing({}))).toEqual([])
  })

  it('compte les cartes, les brouillons (pas les autres artefacts), les réponses et les signaux', () => {
    const tiles = buildTodayTiles(
      briefing({
        actions: [action(['draft_message', 'shortlist']), action(['draft_message'])],
        mail: { state: 'ready', positiveReplies: [{}], unread: [{}, {}], awaitingReply: [{}] },
        discoverAlerts: [{}, {}, {}],
      }),
    )
    expect(tiles.map(tile => [tile.id, tile.count])).toEqual([
      ['queue', 2],
      ['drafts', 2],
      ['replies', 3],
      ['signals', 3],
    ])
  })

  it('une messagerie non connectée ne dit pas « 0 réponse » : elle ne fait pas de tuile', () => {
    const tiles = buildTodayTiles(
      briefing({ actions: [action([])], mail: { state: 'not_connected', positiveReplies: [{}], unread: [{}] } }),
    )
    expect(tiles.map(tile => tile.id)).toEqual(['queue'])
  })

  it('chaque tuile mène à une ancre', () => {
    const tiles = buildTodayTiles(briefing({ actions: [action(['draft_message'])], discoverAlerts: [{}] }))
    expect(tiles.every(tile => tile.target.startsWith('today-'))).toBe(true)
  })
})
