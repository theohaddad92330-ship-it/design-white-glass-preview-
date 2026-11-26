import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEMORY_ITEMS_SENT_MAX } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { AccountsService } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { MemoryService, PinnedFact } from '../memory/memory.service'
import { ChatContextService } from './chat-context.service'

/**
 * #1916.24 — CE QUI PART AU MODÈLE EST CE QUI EST TRACÉ.
 *
 * Le contexte porte, à côté des éléments envoyés, leurs IDENTIFIANTS — dans le
 * même ordre, après les mêmes filtres. La borne du prompt s'applique ICI, avant
 * l'envoi : un élément au-delà n'entre pas dans le prompt, il ne doit pas non
 * plus entrer dans la trace.
 */

function fact(index: number, text = `Élément ${index}`): PinnedFact {
  return {
    id: `f-${index}`,
    fact: text,
    accountId: null,
    kind: 'fact',
    origin: 'manual',
    scope: 'workspace',
    ownedByMe: true,
    canForget: true,
    expiresAt: null,
    createdAt: '2026-09-10T09:00:00.000Z',
  }
}

function build(facts: PinnedFact[] | Error) {
  const memory = {
    listFacts: facts instanceof Error ? jest.fn().mockRejectedValue(facts) : jest.fn().mockResolvedValue(facts),
    getPreferences: jest.fn().mockResolvedValue({}),
    getConversationSummary: jest.fn().mockResolvedValue(null),
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
  return { service }
}

describe('ChatContextService — les éléments de mémoire envoyés, et leurs identifiants', () => {
  it('porte les identifiants des éléments envoyés, dans l’ordre du prompt', async () => {
    const { service } = build([fact(1, 'Budget voté'), fact(2, 'Ne propose plus de régie')])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.pinnedFacts.map(item => item.fact)).toEqual(['Budget voté', 'Ne propose plus de régie'])
    expect(ctx.pinnedFactIds).toEqual(['f-1', 'f-2'])
  })

  it('NON — un élément au-delà de la borne du prompt n’est ni envoyé ni tracé', async () => {
    const { service } = build(Array.from({ length: MEMORY_ITEMS_SENT_MAX + 3 }, (_, index) => fact(index)))
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.pinnedFacts).toHaveLength(MEMORY_ITEMS_SENT_MAX)
    expect(ctx.pinnedFactIds).toHaveLength(MEMORY_ITEMS_SENT_MAX)
    expect(ctx.pinnedFactIds).not.toContain(`f-${MEMORY_ITEMS_SENT_MAX}`)
  })

  it('NON — un texte vide (que le prompt ne lit pas) n’est pas tracé', async () => {
    const { service } = build([fact(1, '   '), fact(2, 'Budget voté')])
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.pinnedFactIds).toEqual(['f-2'])
    expect(ctx.pinnedFacts).toEqual([{ fact: 'Budget voté', kind: 'fact', origin: 'manual' }])
  })

  it('une mémoire illisible n’envoie rien, donc ne trace rien', async () => {
    const { service } = build(new Error('db down'))
    const ctx = await service.build({ userId: 'u-1', workspaceId: 'ws-1' })
    expect(ctx.pinnedFacts).toEqual([])
    expect(ctx.pinnedFactIds).toEqual([])
  })
})

describe('la borne de l’API est celle du prompt de Laura (lecture du fichier Python)', () => {
  const advisor = join(__dirname, '..', '..', '..', '..', 'ia', 'app', 'prompts', 'bellum_advisor.py')

  it('LIT quelque chose — le fichier du prompt existe et déclare sa borne', () => {
    expect(readFileSync(advisor, 'utf8')).toMatch(/^_MEMORY_ITEMS_MAX = \d+$/m)
  })

  it('les deux bornes sont égales — sinon l’API tracerait ce que le prompt coupe, ou l’inverse', () => {
    const match = readFileSync(advisor, 'utf8').match(/^_MEMORY_ITEMS_MAX = (\d+)$/m)
    expect(Number(match?.[1])).toBe(MEMORY_ITEMS_SENT_MAX)
  })
})
