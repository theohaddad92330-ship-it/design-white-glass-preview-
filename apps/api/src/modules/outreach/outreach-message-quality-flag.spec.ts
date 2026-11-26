/**
 * #2877 (#2385.4) — un signal qualité DÉCLARÉ sur un message : écrit pour
 * l'auteur dans son espace, jamais sur le message d'un autre espace, et sans
 * toucher ni l'état ni le texte du message.
 */
import { NotFoundException } from '@nestjs/common'
import { OutreachMessageService, type OutreachCtx } from './outreach-message.service'

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_WS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER = '11111111-1111-4111-8111-111111111111'
const MESSAGE = '99999999-9999-4999-8999-999999999999'
const ctx: OutreachCtx = { userId: USER, workspaceId: WS, role: 'sales' }

function build(messageWorkspace: string = WS) {
  const row = { id: MESSAGE, workspace_id: messageWorkspace, status: 'needs_review', current_version: 2 }
  const messages = {
    findOne: jest.fn(async (opts: { where: { id: string; workspace_id?: string } }) =>
      opts.where.id === row.id && opts.where.workspace_id === row.workspace_id ? row : null,
    ),
    save: jest.fn(),
  }
  const inserted: unknown[] = []
  const builder = {
    insert: () => builder,
    values: (v: unknown) => {
      inserted.push(v)
      return builder
    },
    orIgnore: () => builder,
    execute: jest.fn(async () => undefined),
  }
  const flagRows: Array<{ message_id: string; kind: string }> = []
  const qualityFlags = {
    createQueryBuilder: () => builder,
    find: jest.fn(async (opts: { where: { flagged_by: string; workspace_id: string } }) =>
      opts.where.flagged_by === USER && opts.where.workspace_id === WS ? flagRows : [],
    ),
  }
  const none = {} as never
  const service = new OutreachMessageService(
    messages as never,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    qualityFlags as never,
  )
  return { service, inserted, messages, builder, flagRows, qualityFlags }
}

describe('OutreachMessageService.flagQuality (#2385.4)', () => {
  it('consigne la nature DÉCLARÉE pour cet auteur, dans son espace', async () => {
    const { service, inserted } = build()
    await expect(service.flagQuality(ctx, MESSAGE, 'wrong_fact')).resolves.toEqual({ kind: 'wrong_fact' })
    expect(inserted).toEqual([{ workspace_id: WS, message_id: MESSAGE, flagged_by: USER, kind: 'wrong_fact' }])
  })

  it('refuse le message d’un autre espace — 404, rien n’est écrit', async () => {
    const { service, inserted } = build(OTHER_WS)
    await expect(service.flagQuality(ctx, MESSAGE, 'wrong_cta')).rejects.toBeInstanceOf(NotFoundException)
    expect(inserted).toHaveLength(0)
  })

  it('un signal n’est pas une décision : ni l’état ni le texte du message ne bougent', async () => {
    const { service, messages } = build()
    await service.flagQuality(ctx, MESSAGE, 'wrong_persona')
    expect(messages.save).not.toHaveBeenCalled()
  })

  it('re-déclarer la même nature est sans effet (insertion qui ignore le doublon)', async () => {
    const { service, builder } = build()
    await service.flagQuality(ctx, MESSAGE, 'wrong_fact')
    await service.flagQuality(ctx, MESSAGE, 'wrong_fact')
    expect(builder.execute).toHaveBeenCalledTimes(2)
  })
})

describe('OutreachMessageService.ownQualityFlags (#2385.4 — la déclaration se relit sur la carte)', () => {
  it('rend, par message, les natures que CET auteur a déclarées dans son espace', async () => {
    const { service, flagRows } = build()
    flagRows.push({ message_id: MESSAGE, kind: 'wrong_fact' }, { message_id: MESSAGE, kind: 'wrong_cta' })
    const byMessage = await service.ownQualityFlags(ctx, [MESSAGE])
    expect(byMessage.get(MESSAGE)).toEqual(['wrong_fact', 'wrong_cta'])
  })

  it('un message sans déclaration n’a pas d’entrée — une absence ne fait aucune ligne', async () => {
    const { service } = build()
    const byMessage = await service.ownQualityFlags(ctx, [MESSAGE])
    expect(byMessage.has(MESSAGE)).toBe(false)
  })

  it('ne lit pas la déclaration d’un collègue', async () => {
    const { service, flagRows } = build()
    flagRows.push({ message_id: MESSAGE, kind: 'wrong_fact' })
    const other: OutreachCtx = { ...ctx, userId: '22222222-2222-4222-8222-222222222222' }
    expect((await service.ownQualityFlags(other, [MESSAGE])).size).toBe(0)
  })
})
