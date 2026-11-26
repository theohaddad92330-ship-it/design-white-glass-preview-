import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { AccountsService } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { MemoryService } from '../memory/memory.service'
import { ChatContextService } from './chat-context.service'

/**
 * #2430.2 — UNE BRANCHE PART AVEC CE QUE SON FIL D'ORIGINE SAVAIT.
 *
 * Explorer une autre hypothèse ouvre un fil NEUF (`ChatConversationsService.branch`) :
 * sans ce passage, Laura y répondrait comme à une conversation vierge. Le
 * résumé roulant du fil d'origine — celui de LA MÊME personne (D65) — entre
 * donc dans le contexte de la branche, nommé comme tel. Aucun message du
 * parent n'est copié.
 */
function build(summaries: Record<string, string | null>) {
  const getConversationSummary = jest.fn(
    async (args: { userId: string; conversationId?: string | null }) => summaries[args.conversationId ?? ''] ?? null,
  )
  const memory = {
    listFacts: jest.fn().mockResolvedValue([]),
    getPreferences: jest.fn().mockResolvedValue({}),
    getConversationSummary,
  } as unknown as MemoryService
  const accounts = {
    listAccountsDigest: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    listCopilotAccountFacts: jest.fn().mockResolvedValue(new Map()),
  } as unknown as AccountsService
  const crmConnections = {
    findOne: jest.fn().mockResolvedValue(null),
    manager: { query: jest.fn().mockResolvedValue([]) },
  } as unknown as Repository<CrmConnectionEntity>
  const service = new ChatContextService(
    accounts,
    { findByAccount: jest.fn().mockResolvedValue([]) } as unknown as ContactsService,
    { resolveProfileData: jest.fn().mockResolvedValue({}) } as unknown as EsnProfileReader,
    memory,
    crmConnections,
  )
  return { service, getConversationSummary }
}

describe('ChatContextService — #2430.2 le fil d’origine d’une branche', () => {
  it('le résumé du fil d’origine entre dans la branche, nommé, pour la même personne', async () => {
    const { service, getConversationSummary } = build({ parent: 'Budget voté en juin ; décideur : la DSI.' })
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      conversationId: 'branche',
      parentConversationId: 'parent',
    })
    expect(ctx.conversationSummary).toContain('Budget voté en juin')
    expect(ctx.conversationSummary).toContain('fil d’origine')
    expect(getConversationSummary).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', workspaceId: 'ws-1', conversationId: 'parent' }),
    )
  })

  it('garde le résumé propre de la branche, le fil d’origine vient APRÈS', async () => {
    const { service } = build({ branche: 'Piste régie explorée.', parent: 'Budget voté.' })
    const ctx = await service.build({
      userId: 'u-1',
      workspaceId: 'ws-1',
      conversationId: 'branche',
      parentConversationId: 'parent',
    })
    expect(ctx.conversationSummary?.startsWith('Piste régie explorée.')).toBe(true)
    expect(ctx.conversationSummary).toContain('Budget voté.')
  })

  it('NON — un fil sans parent ne lit aucun autre résumé que le sien', async () => {
    const { service, getConversationSummary } = build({ branche: 'Piste régie explorée.', parent: 'Budget voté.' })
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1', conversationId: 'branche' })
    expect(ctx.conversationSummary).toBe('Piste régie explorée.')
    expect(getConversationSummary).toHaveBeenCalledTimes(1)
  })
})
