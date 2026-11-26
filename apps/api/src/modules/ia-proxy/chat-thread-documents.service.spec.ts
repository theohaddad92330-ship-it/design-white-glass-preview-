import type { ChatMessagesService } from './chat-messages.service'
import { ChatThreadDocumentsService } from './chat-thread-documents.service'

type Row = {
  id: string
  workspace_id: string
  scope: 'workspace' | 'conversation'
  conversation_id: string | null
  user_id: string
}

/** Un faux dépôt qui APPLIQUE le `where` : le test prouve le filtre, pas seulement l'argument. */
function fakeDocs(rows: Row[]) {
  return {
    delete: jest.fn(async (where: Record<string, unknown>) => {
      const before = rows.length
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index] as unknown as Record<string, unknown>
        if (Object.entries(where).every(([column, value]) => row[column] === value)) rows.splice(index, 1)
      }
      return { affected: before - rows.length }
    }),
  }
}

function threadRows(): Row[] {
  return [
    { id: 'fil-A', workspace_id: 'ws-1', scope: 'conversation', conversation_id: 'c-A', user_id: 'u-1' },
    { id: 'fil-A-collegue', workspace_id: 'ws-1', scope: 'conversation', conversation_id: 'c-A', user_id: 'u-2' },
    // Un document de l'ESN qui porterait la même clé de fil : il reste.
    { id: 'espace-meme-fil', workspace_id: 'ws-1', scope: 'workspace', conversation_id: 'c-A', user_id: 'u-1' },
    { id: 'espace', workspace_id: 'ws-1', scope: 'workspace', conversation_id: null, user_id: 'u-1' },
    { id: 'autre-fil', workspace_id: 'ws-1', scope: 'conversation', conversation_id: 'c-B', user_id: 'u-1' },
    { id: 'autre-espace', workspace_id: 'ws-2', scope: 'conversation', conversation_id: 'c-A', user_id: 'u-9' },
  ]
}

describe('ChatThreadDocumentsService', () => {
  describe('deleteForThread — supprimer un fil supprime SES documents « fil seul » (#1954)', () => {
    it('NON : jamais un document de l’ESN, jamais un autre fil, jamais un autre espace', async () => {
      // Preuve que le test sait dire NON : retirer `scope` du `where` emporte
      // « espace-meme-fil » ; retirer `workspace_id` emporte « autre-espace ».
      const rows = threadRows()
      const docs = fakeDocs(rows)
      const service = new ChatThreadDocumentsService({} as ChatMessagesService, docs as never)

      const deleted = await service.deleteForThread({ workspaceId: 'ws-1', conversationId: 'c-A' })

      expect(deleted).toBe(2)
      expect(rows.map(row => row.id).sort()).toEqual(['autre-espace', 'autre-fil', 'espace', 'espace-meme-fil'])
    })

    it('NON : un fil sans clé de conversation ne supprime RIEN', async () => {
      // Un `where` sans `conversation_id` viderait TOUS les documents « fil
      // seul » de l'espace. Aucun appel ne part.
      const rows = threadRows()
      const docs = fakeDocs(rows)
      const service = new ChatThreadDocumentsService({} as ChatMessagesService, docs as never)

      expect(await service.deleteForThread({ workspaceId: 'ws-1', conversationId: null })).toBe(0)
      expect(docs.delete).not.toHaveBeenCalled()
      expect(rows).toHaveLength(6)
    })
  })

  describe('readableThread — le fil dont CE tour peut lire les documents « fil seul »', () => {
    function build(isThreadArchived: jest.Mock) {
      return new ChatThreadDocumentsService(
        { isThreadArchived } as unknown as ChatMessagesService,
        fakeDocs([]) as never,
      )
    }
    const target = { userId: 'u-1', workspaceId: 'ws-1', accountId: null, conversationId: 'c-A' }

    it('un fil vivant rend sa clé', async () => {
      const isThreadArchived = jest.fn().mockResolvedValue(false)
      expect(await build(isThreadArchived).readableThread(target)).toBe('c-A')
      expect(isThreadArchived).toHaveBeenCalledWith(target)
    })

    it('un fil rangé ne rend rien : ses documents sont masqués tant qu’il n’est pas ressorti', async () => {
      expect(await build(jest.fn().mockResolvedValue(true)).readableThread(target)).toBeUndefined()
    })

    it('sans clé de fil, rien à lire et rien à interroger', async () => {
      const isThreadArchived = jest.fn()
      expect(await build(isThreadArchived).readableThread({ ...target, conversationId: null })).toBeUndefined()
      expect(isThreadArchived).not.toHaveBeenCalled()
    })

    it('une lecture qui échoue ferme la porte (fail closed), sans faire tomber le tour', async () => {
      expect(await build(jest.fn().mockRejectedValue(new Error('db down'))).readableThread(target)).toBeUndefined()
    })
  })
})
