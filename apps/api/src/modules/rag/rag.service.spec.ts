import { FindOperator, IsNull } from 'typeorm'
import { RagService } from './rag.service'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

type FindOptions = { where: Record<string, unknown> | Array<Record<string, unknown>> }

/** Un faux `find` qui applique VRAIMENT le `where` (objet, ou tableau = OU),
 *  `IsNull()` compris — sans ça, un `FindOperator` ne matcherait jamais rien. */
function honouringFind(rows: RagDocumentEntity[]) {
  return jest.fn(async (options: FindOptions) => {
    const clauses = Array.isArray(options.where) ? options.where : [options.where]
    return rows.filter(row =>
      clauses.some(clause =>
        Object.entries(clause).every(([column, value]) => {
          const actual = (row as unknown as Record<string, unknown>)[column]
          if (value instanceof FindOperator) {
            return value.type === 'isNull' ? actual === null || actual === undefined : false
          }
          return actual === value
        }),
      ),
    )
  })
}

describe('RagService', () => {
  let service: RagService
  let repo: MockRepository<RagDocumentEntity>
  // #2779 — le dépôt des comptes : « ce compte est-il de cet espace ? »
  const accounts = { count: jest.fn() }

  beforeEach(() => {
    accounts.count.mockReset()
    repo = createMockRepository<RagDocumentEntity>()
    service = new RagService(repo as never, accounts as never)
  })

  describe('listForWorkspace', () => {
    it('scopes the read to the active workspace, ordered by created_at DESC', async () => {
      const rows = [{ id: '1' }, { id: '2' }] as RagDocumentEntity[]
      repo.find.mockResolvedValueOnce(rows)
      const result = await service.listForWorkspace('ws-1', 'user-1')
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          // #1954.7 — jamais un document joint au chat (`conversation`) ;
          // #2779 — le `personal` seulement pour son auteur ;
          // #2431.5 (épopée #2886) — jamais un document ARCHIVÉ (remplacé).
          where: [
            { workspace_id: 'ws-1', scope: 'workspace', archived_at: IsNull() },
            { workspace_id: 'ws-1', scope: 'knowledge_base', archived_at: IsNull() },
            { workspace_id: 'ws-1', scope: 'account', archived_at: IsNull() },
            { workspace_id: 'ws-1', scope: 'personal', user_id: 'user-1', archived_at: IsNull() },
          ],
          order: { created_at: 'DESC' },
        }),
      )
      expect(result).toEqual(rows)
    })

    it('#2431.5 (épopée #2886) — exclut un document ARCHIVÉ (remplacé) de la liste', async () => {
      // Comportemental, comme le test `conversation` juste au-dessus : un faux
      // repo qui applique VRAIMENT le `where` — `archived_at: IsNull()` ne
      // matche que `null`, jamais une date posée par `replaceDocument`.
      const rows = [
        { id: 'live', workspace_id: 'ws-1', scope: 'workspace', archived_at: null },
        { id: 'old', workspace_id: 'ws-1', scope: 'workspace', archived_at: new Date('2026-01-01') },
      ] as unknown as RagDocumentEntity[]
      const svc = new RagService({ find: honouringFind(rows) } as never, accounts as never)
      const result = await svc.listForWorkspace('ws-1', 'user-1')
      expect(result.map(r => r.id)).toEqual(['live'])
    })

    it('#1954.7 — excludes a conversation-scoped document from the workspace list', async () => {
      // Comportemental, pas seulement l'argument passé au repo : un faux
      // repository qui applique VRAIMENT le `where` prouve que le filtre
      // fonctionne, pas seulement qu'il est demandé. Preuve que le test sait
      // dire NON : retirer `scope: 'workspace'` du `where` fait réapparaître
      // le document joint dans la liste.
      const rows = [
        { id: 'w-1', workspace_id: 'ws-1', scope: 'workspace' },
        { id: 'c-1', workspace_id: 'ws-1', scope: 'conversation', conversation_id: 'thread-A' },
      ] as unknown as RagDocumentEntity[]
      const svc = new RagService({ find: honouringFind(rows) } as never, accounts as never)
      const result = await svc.listForWorkspace('ws-1', 'user-1')
      expect(result.map(r => r.id)).toEqual(['w-1'])
    })

    it('returns [] on repo error', async () => {
      repo.find.mockRejectedValueOnce(new Error('boom'))
      expect(await service.listForWorkspace('ws-1', 'user-1')).toEqual([])
    })

    // Proof the Phase-2 scope switch is behaviour-preserving TODAY: with a repo
    // that actually honours the `where` clause and rows whose workspace_id was
    // backfilled 1:1 from their owner, scoping by workspace_id returns the exact
    // same rows the former `where user_id` scoping did — and still excludes
    // other tenants. See agent_docs/multi-user-workspaces.md.
    it('returns rows identical to the former user_id scoping (1 user = 1 workspace)', async () => {
      const now = Date.now()
      const rows = [
        { id: 'a', user_id: 'u1', workspace_id: 'w1', scope: 'workspace', created_at: new Date(now - 1_000) },
        { id: 'b', user_id: 'u1', workspace_id: 'w1', scope: 'workspace', created_at: new Date(now - 2_000) },
        { id: 'c', user_id: 'u2', workspace_id: 'w2', scope: 'workspace', created_at: new Date(now) },
      ] as unknown as RagDocumentEntity[]
      const byCreatedDesc = (x: RagDocumentEntity, y: RagDocumentEntity) =>
        y.created_at.getTime() - x.created_at.getTime()
      const svc = new RagService(
        { find: jest.fn(async (o: FindOptions) => (await honouringFind(rows)(o)).sort(byCreatedDesc)) } as never,
        accounts as never,
      )

      const underWorkspaceScope = await svc.listForWorkspace('w1', 'u1')
      // What per-user scoping returned for u1 (the sole member of w1 today):
      const underUserScope = rows.filter(row => row.user_id === 'u1').sort(byCreatedDesc)

      expect(underWorkspaceScope.map(r => r.id)).toEqual(underUserScope.map(r => r.id))
      expect(underWorkspaceScope.map(r => r.id)).toEqual(['a', 'b'])
      expect(underWorkspaceScope.some(r => r.id === 'c')).toBe(false) // other tenant excluded
    })
  })

  describe('deleteForUser', () => {
    // #1954.20 — « retirer » une pièce jointe du chat SUPPRIME le document
    // ingéré (décision de Louis, 12/09/2026). C'est la route que l'écran du chat
    // appelle, et celle de « Connaissances » : son cloisonnement doit tenir
    // l'AUTEUR et l'ESPACE, dans la MÊME instruction — jamais `where: { id }`.
    it('#1954.20 — deletes by id, author AND workspace in one statement', async () => {
      repo.delete.mockResolvedValueOnce({ affected: 1 } as never)
      const result = await service.deleteForUser('doc-1', 'user-1', 'ws-1')
      expect(result.type).toBe('success')
      expect(repo.delete).toHaveBeenCalledWith({ id: 'doc-1', user_id: 'user-1', workspace_id: 'ws-1' })
    })

    it('#3803 — rend l’original que le document portait, lu sous le MÊME cloisonnement, pour qu’il parte avec lui', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'doc-1', source_object_id: 'obj-1' } as RagDocumentEntity)
      repo.delete.mockResolvedValueOnce({ affected: 1 } as never)
      const result = await service.deleteForUser('doc-1', 'user-1', 'ws-1')
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'doc-1', user_id: 'user-1', workspace_id: 'ws-1' },
        select: ['id', 'source_object_id'],
      })
      expect(result).toEqual({ type: 'success', output: { sourceObjectId: 'obj-1' } })
    })

    it('returns not_found when nothing matched (missing, another author, or another workspace)', async () => {
      repo.delete.mockResolvedValueOnce({ affected: 0 } as never)
      const result = await service.deleteForUser('doc-1', 'user-1', 'ws-1')
      expect(result).toEqual({ type: 'failure', problem: { code: 'not_found', message: 'Document introuvable' } })
    })

    it('returns delete_failed when the query explodes', async () => {
      repo.delete.mockRejectedValueOnce(new Error('boom') as never)
      const result = await service.deleteForUser('doc-1', 'user-1', 'ws-1')
      expect(result.type).toBe('failure')
      expect(result.type === 'failure' && result.problem.code).toBe('delete_failed')
    })

    it('#1954.20 — NON : ni un collègue du même espace, ni l’auteur depuis un autre espace ne suppriment le document', async () => {
      // Comportemental : un faux dépôt qui APPLIQUE le `where`. Preuve que le test
      // sait dire NON — retirer `user_id` du `where` laisse le collègue supprimer
      // le document ; retirer `workspace_id` laisse l'auteur le supprimer depuis
      // un autre espace.
      const rows: Array<Record<string, unknown>> = [
        { id: 'doc-conv', user_id: 'author', workspace_id: 'ws-1', scope: 'conversation', conversation_id: 'thread-A' },
      ]
      const fakeDelete = jest.fn(async (where: Record<string, unknown>) => {
        const before = rows.length
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          const row = rows[index] as Record<string, unknown>
          if (Object.entries(where).every(([column, value]) => row[column] === value)) rows.splice(index, 1)
        }
        return { affected: before - rows.length }
      })
      const svc = new RagService({ delete: fakeDelete, findOne: jest.fn(async () => null) } as never, accounts as never)

      expect((await svc.deleteForUser('doc-conv', 'colleague', 'ws-1')).type).toBe('failure')
      expect((await svc.deleteForUser('doc-conv', 'author', 'ws-2')).type).toBe('failure')
      expect(rows).toHaveLength(1)

      expect((await svc.deleteForUser('doc-conv', 'author', 'ws-1')).type).toBe('success')
      expect(rows).toHaveLength(0)
    })
  })

  // #1954.22 — changer la portée d'un document DÉJÀ attaché (Louis, 12/09/2026,
  // même décision que #1954.7). Même cloisonnement que `deleteForUser` :
  // AUTEUR et ESPACE dans la MÊME instruction, jamais `where: { id }`.
  describe('updateScopeForUser', () => {
    it('#1954.22 — élargit à `workspace` et efface `conversation_id`, auteur+espace dans le WHERE', async () => {
      repo.update.mockResolvedValueOnce({ affected: 1 } as never)
      const result = await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'workspace', null)
      expect(result.type).toBe('success')
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'doc-1', user_id: 'user-1', workspace_id: 'ws-1' },
        { scope: 'workspace', conversation_id: null, account_id: null },
      )
    })

    it('#1954.22 — restreint à `conversation` et porte le fil visé', async () => {
      repo.update.mockResolvedValueOnce({ affected: 1 } as never)
      const result = await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'conversation', 'thread-A')
      expect(result.type).toBe('success')
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'doc-1', user_id: 'user-1', workspace_id: 'ws-1' },
        { scope: 'conversation', conversation_id: 'thread-A', account_id: null },
      )
    })

    it('refuse `conversation` sans fil visé — AVANT toute écriture (même garde que la contrainte SQL)', async () => {
      const result = await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'conversation', null)
      expect(result).toEqual({
        type: 'failure',
        problem: { code: 'scope_requires_conversation', message: expect.any(String) as string },
      })
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('returns not_found when nothing matched (missing, another author, or another workspace)', async () => {
      repo.update.mockResolvedValueOnce({ affected: 0 } as never)
      const result = await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'workspace', null)
      expect(result).toEqual({ type: 'failure', problem: { code: 'not_found', message: 'Document introuvable' } })
    })

    it('returns update_failed when the query explodes', async () => {
      repo.update.mockRejectedValueOnce(new Error('boom') as never)
      const result = await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'workspace', null)
      expect(result.type).toBe('failure')
      expect(result.type === 'failure' && result.problem.code).toBe('update_failed')
    })

    it('#1954.22 — NON : ni un collègue du même espace, ni l’auteur depuis un autre espace ne changent la portée', async () => {
      const rows: Array<Record<string, unknown>> = [
        { id: 'doc-1', user_id: 'author', workspace_id: 'ws-1', scope: 'conversation', conversation_id: 'thread-A' },
      ]
      const fakeUpdate = jest.fn(async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
        let affected = 0
        for (const row of rows) {
          if (Object.entries(where).every(([column, value]) => row[column] === value)) {
            Object.assign(row, patch)
            affected += 1
          }
        }
        return { affected }
      })
      const svc = new RagService({ update: fakeUpdate } as never, accounts as never)

      expect((await svc.updateScopeForUser('doc-1', 'colleague', 'ws-1', 'workspace', null)).type).toBe('failure')
      expect((await svc.updateScopeForUser('doc-1', 'author', 'ws-2', 'workspace', null)).type).toBe('failure')
      expect(rows[0].scope).toBe('conversation')

      expect((await svc.updateScopeForUser('doc-1', 'author', 'ws-1', 'workspace', null)).type).toBe('success')
      expect(rows[0].scope).toBe('workspace')
    })
  })

  // #1954.19 — prévisualiser un document déjà attaché (Louis, 12/09/2026 :
  // « un clic sur la pièce ouvrira un aperçu de son contenu »).
  // #3803 (3803.5) — « un collègue de l'espace ouvre le même aperçu ; un autre
  // espace jamais » : un document d'ÉQUIPE se lit par tout l'espace, un
  // document `personal`/`conversation` par son seul auteur. L'ESPACE est dans
  // CHAQUE branche du `where`, jamais `where: { id }`.
  describe('getPreviewForReader', () => {
    /** Un faux `findOne` qui APPLIQUE le `where` (objet, ou tableau = OU). */
    function honouringFindOne(rows: Array<Record<string, unknown>>) {
      return jest.fn(async ({ where }: { where: Record<string, unknown> | Array<Record<string, unknown>> }) => {
        const clauses = Array.isArray(where) ? where : [where]
        return (
          rows.find(row =>
            clauses.some(clause => Object.entries(clause).every(([column, value]) => row[column] === value)),
          ) ?? null
        )
      })
    }

    it('#1954.19 — rend le contenu, et `source: null` quand aucun original n’est conservé', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'doc-1',
        title: 'Grille tarifaire',
        content: 'Le contenu complet du document.',
        category: 'pricing',
        source_object_id: null,
      } as RagDocumentEntity)

      const result = await service.getPreviewForReader('doc-1', 'user-1', 'ws-1')

      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            { id: 'doc-1', workspace_id: 'ws-1', user_id: 'user-1' },
            { id: 'doc-1', workspace_id: 'ws-1', scope: 'workspace' },
            { id: 'doc-1', workspace_id: 'ws-1', scope: 'knowledge_base' },
            { id: 'doc-1', workspace_id: 'ws-1', scope: 'account' },
          ],
        }),
      )
      expect(result).toEqual({
        type: 'success',
        output: {
          id: 'doc-1',
          title: 'Grille tarifaire',
          content: 'Le contenu complet du document.',
          category: 'pricing',
          source: null,
        },
      })
    })

    it('#3803 — rend l’original conservé (nom, type, taille), lu dans l’ESPACE et au domaine', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'doc-1',
        title: 'Campagnes ABM',
        content: 'texte',
        category: null,
        source_object_id: 'obj-1',
      } as RagDocumentEntity)
      const query = jest
        .fn()
        .mockResolvedValue([{ file_name: 'campagnes ABM.xlsx', content_type: 'application/x', byte_size: '2048' }])
      ;(repo as unknown as { manager: unknown }).manager = { query }

      const result = await service.getPreviewForReader('doc-1', 'user-1', 'ws-1')

      const [sql, params] = query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('workspace_id = $2')
      expect(sql).toContain("domain = 'rag_document_source'")
      expect(params).toEqual(['obj-1', 'ws-1'])
      expect(result.type === 'success' && result.output.source).toEqual({
        fileName: 'campagnes ABM.xlsx',
        contentType: 'application/x',
        byteSize: 2048,
      })
    })

    it('returns not_found when nothing matched', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.getPreviewForReader('doc-1', 'user-1', 'ws-1')
      expect(result).toEqual({ type: 'failure', problem: { code: 'not_found', message: 'Document introuvable' } })
    })

    it('#3803 — un collègue lit un document d’ÉQUIPE ; jamais le `personal` d’un autre ; un autre espace JAMAIS', async () => {
      const rows: Array<Record<string, unknown>> = [
        {
          id: 'doc-team',
          user_id: 'author',
          workspace_id: 'ws-1',
          scope: 'workspace',
          title: 'Équipe',
          content: 'Partagé',
        },
        {
          id: 'doc-perso',
          user_id: 'author',
          workspace_id: 'ws-1',
          scope: 'personal',
          title: 'Perso',
          content: 'Privé',
        },
      ]
      const svc = new RagService({ findOne: honouringFindOne(rows) } as never, accounts as never)

      expect((await svc.getPreviewForReader('doc-team', 'colleague', 'ws-1')).type).toBe('success')
      expect((await svc.getPreviewForReader('doc-team', 'author', 'ws-2')).type).toBe('failure')
      expect((await svc.getPreviewForReader('doc-team', 'stranger', 'ws-2')).type).toBe('failure')
      expect((await svc.getPreviewForReader('doc-perso', 'colleague', 'ws-1')).type).toBe('failure')
      expect((await svc.getPreviewForReader('doc-perso', 'author', 'ws-1')).type).toBe('success')
    })
  })

  describe('sourceObjectIdForReader (#3803)', () => {
    it('rend l’original d’un document lisible, not_found sinon (sans original compris)', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'doc-1', source_object_id: 'obj-1' } as RagDocumentEntity)
      expect(await service.sourceObjectIdForReader('doc-1', 'user-1', 'ws-1')).toEqual({
        type: 'success',
        output: 'obj-1',
      })
      repo.findOne.mockResolvedValueOnce({ id: 'doc-1', source_object_id: null } as RagDocumentEntity)
      expect((await service.sourceObjectIdForReader('doc-1', 'user-1', 'ws-1')).type).toBe('failure')
      repo.findOne.mockResolvedValueOnce(null)
      expect((await service.sourceObjectIdForReader('doc-1', 'user-1', 'ws-1')).type).toBe('failure')
    })
  })

  describe('attachSource (#3803)', () => {
    it('lie l’original dans l’ESPACE, seulement si le document n’en porte pas déjà un', async () => {
      repo.update.mockResolvedValueOnce({ affected: 1 } as never)
      expect(await service.attachSource('doc-1', 'ws-1', 'obj-1')).toBe(true)
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'doc-1', workspace_id: 'ws-1', source_object_id: IsNull() },
        { source_object_id: 'obj-1' },
      )
      repo.update.mockResolvedValueOnce({ affected: 0 } as never)
      expect(await service.attachSource('doc-1', 'ws-1', 'obj-2')).toBe(false)
    })
  })

  // ─── #2779 — les trois portées manquantes ───────────────────────────────
  describe('#2779 — portées personnel, compte, base durable', () => {
    const ACCOUNT = '0000000a-0000-4000-8000-00000000000a'

    it('NON : la liste ne montre JAMAIS le document personnel d’un collègue ; oui le sien, la base durable et les documents de compte', async () => {
      const rows = [
        { id: 'kb', workspace_id: 'ws-1', scope: 'knowledge_base', user_id: 'bob' },
        { id: 'acct', workspace_id: 'ws-1', scope: 'account', user_id: 'bob', account_id: ACCOUNT },
        { id: 'mine', workspace_id: 'ws-1', scope: 'personal', user_id: 'alice' },
        { id: 'bobs', workspace_id: 'ws-1', scope: 'personal', user_id: 'bob' },
        { id: 'conv', workspace_id: 'ws-1', scope: 'conversation', user_id: 'alice' },
        { id: 'other-ws', workspace_id: 'ws-2', scope: 'knowledge_base', user_id: 'alice' },
      ] as unknown as RagDocumentEntity[]
      const svc = new RagService({ find: honouringFind(rows) } as never, accounts as never)
      const ids = (await svc.listForWorkspace('ws-1', 'alice')).map(r => r.id).sort()
      expect(ids).toEqual(['acct', 'kb', 'mine'])
    })

    it('accountInWorkspace : vrai SEULEMENT pour un compte de cet espace', async () => {
      accounts.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0)
      expect(await service.accountInWorkspace(ACCOUNT, 'ws-1')).toBe(true)
      expect(accounts.count).toHaveBeenLastCalledWith({ where: { id: ACCOUNT, workspace_id: 'ws-1' } })
      expect(await service.accountInWorkspace(ACCOUNT, 'ws-2')).toBe(false)
    })

    it('accountInWorkspace : faux sur une erreur (fail closed)', async () => {
      accounts.count.mockRejectedValueOnce(new Error('boom'))
      expect(await service.accountInWorkspace(ACCOUNT, 'ws-1')).toBe(false)
    })

    it('updateScopeForUser : `account` sans compte est refusé AVANT toute écriture', async () => {
      const result = await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'account', null, null)
      expect(result.type === 'failure' && result.problem.code).toBe('scope_requires_account')
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('NON : `account` vers un compte d’un AUTRE espace est refusé, rien n’est écrit', async () => {
      accounts.count.mockResolvedValueOnce(0)
      const result = await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'account', null, ACCOUNT)
      expect(result.type === 'failure' && result.problem.code).toBe('account_not_in_workspace')
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('rattache le document à SON compte, auteur+espace dans le WHERE', async () => {
      accounts.count.mockResolvedValueOnce(1)
      repo.update.mockResolvedValueOnce({ affected: 1 } as never)
      const result = await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'account', null, ACCOUNT)
      expect(result.type).toBe('success')
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'doc-1', user_id: 'user-1', workspace_id: 'ws-1' },
        { scope: 'account', conversation_id: null, account_id: ACCOUNT },
      )
    })

    it('toute autre portée efface `account_id`', async () => {
      repo.update.mockResolvedValueOnce({ affected: 1 } as never)
      await service.updateScopeForUser('doc-1', 'user-1', 'ws-1', 'personal', null, ACCOUNT)
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'doc-1', user_id: 'user-1', workspace_id: 'ws-1' },
        { scope: 'personal', conversation_id: null, account_id: null },
      )
    })
  })

  // #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà
  // importée. Même cloisonnement que `deleteForUser`/`updateScopeForUser` :
  // AUTEUR et ESPACE dans la MÊME instruction, jamais `where: { id }`. On
  // archive, on ne supprime pas : l'ANCIEN document reste en base, daté et
  // relié au NOUVEAU par son identifiant.
  describe('replaceDocument', () => {
    it('date `archived_at` et pose `replaced_by_id`, auteur+espace dans le WHERE', async () => {
      repo.update.mockResolvedValueOnce({ affected: 1 } as never)
      const result = await service.replaceDocument('doc-old', 'user-1', 'ws-1', 'doc-new')
      expect(result.type).toBe('success')
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'doc-old', user_id: 'user-1', workspace_id: 'ws-1' },
        { archived_at: expect.any(Date) as Date, replaced_by_id: 'doc-new' },
      )
    })

    it('returns not_found when nothing matched (missing, another author, or another workspace)', async () => {
      repo.update.mockResolvedValueOnce({ affected: 0 } as never)
      const result = await service.replaceDocument('doc-old', 'user-1', 'ws-1', 'doc-new')
      expect(result).toEqual({ type: 'failure', problem: { code: 'not_found', message: 'Document introuvable' } })
    })

    it('returns update_failed when the query explodes', async () => {
      repo.update.mockRejectedValueOnce(new Error('boom') as never)
      const result = await service.replaceDocument('doc-old', 'user-1', 'ws-1', 'doc-new')
      expect(result.type).toBe('failure')
      expect(result.type === 'failure' && result.problem.code).toBe('update_failed')
    })

    it('NON : ni un collègue du même espace, ni l’auteur depuis un autre espace ne lient le remplacement', async () => {
      const rows: Array<Record<string, unknown>> = [
        { id: 'doc-old', user_id: 'author', workspace_id: 'ws-1', archived_at: null, replaced_by_id: null },
      ]
      const fakeUpdate = jest.fn(async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
        let affected = 0
        for (const row of rows) {
          if (Object.entries(where).every(([column, value]) => row[column] === value)) {
            Object.assign(row, patch)
            affected += 1
          }
        }
        return { affected }
      })
      const svc = new RagService({ update: fakeUpdate } as never, accounts as never)

      expect((await svc.replaceDocument('doc-old', 'colleague', 'ws-1', 'doc-new')).type).toBe('failure')
      expect((await svc.replaceDocument('doc-old', 'author', 'ws-2', 'doc-new')).type).toBe('failure')
      expect(rows[0].replaced_by_id).toBeNull()

      expect((await svc.replaceDocument('doc-old', 'author', 'ws-1', 'doc-new')).type).toBe('success')
      expect(rows[0].replaced_by_id).toBe('doc-new')
    })
  })
})
