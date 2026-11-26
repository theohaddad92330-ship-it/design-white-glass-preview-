import { BadGatewayException } from '@nestjs/common'
import { success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { AccountsService } from '../accounts/accounts.service'
import type { ActionPlanItemsService } from '../actions/action-plan-items.service'
import type { AnalysisService } from '../analysis/analysis.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { CreditsService } from '../credits/credits.service'
import type { CrmService } from '../crm/crm.service'
import type { IaClient } from '../ia/ia.client'
import type { ChatContextService } from '../ia-proxy/chat-context.service'
import type { MemoryReplyUsesService } from '../memory/memory-reply-uses.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { McpApiController } from './mcp-api.controller'

/**
 * #1916.24 — `ask_bellum` : la MÊME capture que le chat.
 *
 * La réponse d'un assistant externe n'est pas un message de fil : aucune
 * conversation ne la porte. Les éléments envoyés sont tracés sous la surface
 * `externalAssistant`, sans message ; ils comptent dans « consulté dans N
 * réponses » pour la personne qui a posé la question, et pour elle seule. Le
 * contrat MCP (ce que l'assistant reçoit) ne change pas.
 */

const user = { userId: 'user-1' } as CurrentUserPayload

function build(opts: { reply?: { success: boolean; data: Record<string, unknown> }; factIds?: string[] } = {}) {
  const accounts = { findOneForWorkspace: jest.fn().mockResolvedValue(success({ id: 'acc-1' })) }
  const chatContext = {
    build: jest.fn().mockResolvedValue({
      accountData: { company_name: 'Acme' },
      contactsSummary: null,
      planSummary: null,
      accountsSummary: null,
      profileData: {},
      pinnedFacts: [
        { fact: 'Budget voté', kind: 'fact', origin: 'manual' },
        { fact: 'Ne propose plus de régie', kind: 'correction', origin: 'manual' },
      ],
      pinnedFactIds: opts.factIds ?? ['f-1', 'f-2'],
      userPreferences: {},
      conversationSummary: null,
      crmConnected: false,
      crmProvider: null,
      crmPresence: null,
      accountFeedback: null,
    }),
  }
  const ia = {
    chat: jest.fn().mockResolvedValue(opts.reply ?? { success: true, data: { reply: 'Voici l’angle.' } }),
  }
  const replyUses = { captureTurn: jest.fn().mockResolvedValue('turn-1') }
  const controller = new McpApiController(
    accounts as unknown as AccountsService,
    {} as unknown as ContactsService,
    {} as unknown as AnalysisService,
    {} as unknown as CreditsService,
    {} as unknown as ActionPlanItemsService,
    {} as unknown as CrmService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
    } as unknown as WorkspaceContextService,
    chatContext as unknown as ChatContextService,
    ia as unknown as IaClient,
    undefined,
    replyUses as unknown as MemoryReplyUsesService,
    undefined, // replyFeedback
    // Le cloisonnement de périmètre : `null` = tout l'espace.
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )
  return { controller, replyUses }
}

describe('ask_bellum — trace des éléments de mémoire envoyés', () => {
  it('capture les éléments envoyés sous la surface « assistant externe », sans toucher la réponse MCP', async () => {
    const { controller, replyUses } = build()
    const result = await controller.askAccount('acc-1', { question: 'Quel angle ?' }, user)
    expect(replyUses.captureTurn).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'ws-1',
      surface: 'externalAssistant',
      factIds: ['f-1', 'f-2'],
    })
    expect(result).toEqual({ account_id: 'acc-1', question: 'Quel angle ?', reply: 'Voici l’angle.' })
  })

  it('NON — une réponse ratée ne capture rien', async () => {
    const { controller, replyUses } = build({ reply: { success: false, data: {} } })
    await expect(controller.askAccount('acc-1', { question: 'Quel angle ?' }, user)).rejects.toBeInstanceOf(
      BadGatewayException,
    )
    expect(replyUses.captureTurn).not.toHaveBeenCalled()
  })

  it('aucun élément envoyé : aucune capture', async () => {
    const { controller, replyUses } = build({ factIds: [] })
    await controller.askAccount('acc-1', { question: 'Quel angle ?' }, user)
    expect(replyUses.captureTurn).not.toHaveBeenCalled()
  })

  it('une capture qui jette ne fait pas tomber la réponse', async () => {
    const { controller, replyUses } = build()
    replyUses.captureTurn.mockRejectedValueOnce(new Error('db down'))
    await expect(controller.askAccount('acc-1', { question: 'Quel angle ?' }, user)).resolves.toMatchObject({
      reply: 'Voici l’angle.',
    })
  })
})
