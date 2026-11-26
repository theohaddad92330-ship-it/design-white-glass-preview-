import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { IsNull } from 'typeorm'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { MemoryFactEventEntity } from '../../database/entities/memory-fact-event.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { MemoryService, nextSummary } from './memory.service'

describe('MemoryService', () => {
  let service: MemoryService
  let facts: MockRepository<MemoryPinnedFactEntity>
  let prefs: MockRepository<UserPreferenceEntity>
  let summaries: MockRepository<ConversationSummaryEntity>
  let interventions: MockRepository<LauraInterventionEntity>
  let events: MockRepository<MemoryFactEventEntity>

  beforeEach(() => {
    facts = createMockRepository<MemoryPinnedFactEntity>()
    // #1916.23 — une écriture d'élément et son geste journalisé passent par une
    // transaction ; ici, elle rend les mêmes dépôts simulés.
    Object.assign(facts.manager, {
      transaction: jest.fn(async (work: (em: { withRepository: <R>(repo: R) => R }) => unknown) =>
        work({ withRepository: repo => repo }),
      ),
    })
    prefs = createMockRepository<UserPreferenceEntity>()
    summaries = createMockRepository<ConversationSummaryEntity>()
    interventions = createMockRepository<LauraInterventionEntity>()
    events = createMockRepository<MemoryFactEventEntity>()
    service = new MemoryService(
      facts as never,
      prefs as never,
      summaries as never,
      interventions as never,
      createMockRepository() as never,
      { resolveProfileData: jest.fn().mockResolvedValue({}), resolveContext: jest.fn() } as never,
      events as never,
    )
  })

  describe('pinFact', () => {
    it('stamps user_id + workspace_id and trims the fact', async () => {
      facts.save.mockResolvedValueOnce({
        id: 'f-1',
        user_id: 'u-1',
        account_id: 'a-1',
        fact: 'DSI décideur',
        kind: 'fact',
        origin: 'manual',
        scope: 'workspace',
        expires_at: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
      } as MemoryPinnedFactEntity)
      const result = await service.pinFact({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: 'a-1',
        fact: '  DSI décideur  ',
      })
      expect(facts.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u-1', workspace_id: 'ws-1', account_id: 'a-1', fact: 'DSI décideur' }),
      )
      expect(result).toEqual({
        id: 'f-1',
        fact: 'DSI décideur',
        accountId: 'a-1',
        kind: 'fact',
        origin: 'manual',
        scope: 'workspace',
        // #1918.2 — aucune portée d'équipe : la ligne ne désigne aucun périmètre.
        businessUnitId: null,
        // #2260.7 — aucun objet visé : la ligne ne désigne ni contact, ni besoin,
        // ni consultant, ni mission.
        object: null,
        ownedByMe: true,
        // #1918.7 — l'auteur peut toujours retirer ce qu'il a épinglé.
        canForget: true,
        expiresAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        // Q1 (13/09) — un élément neuf n'est confirmé par personne.
        confirmedAt: null,
      })
    })

    // ── MemoryItem complet (restitution V2 §20) ──────────────────────────────
    it('defaults to a hand-pinned FACT with no deadline — le comportement historique', async () => {
      facts.save.mockResolvedValueOnce({
        id: 'f-2',
        account_id: null,
        fact: 'x',
        kind: 'fact',
        origin: 'manual',
        expires_at: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
      } as MemoryPinnedFactEntity)
      await service.pinFact({ userId: 'u-1', workspaceId: 'ws-1', accountId: null, fact: 'x' })
      expect(facts.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'fact', origin: 'manual', expires_at: null }),
      )
    })

    it('persists the nature, the origin and the deadline when they are given', async () => {
      facts.save.mockResolvedValueOnce({
        id: 'f-3',
        account_id: null,
        fact: 'Ne jamais proposer de régie',
        kind: 'correction',
        origin: 'copilot',
        expires_at: new Date('2026-12-31T23:00:00Z'),
        created_at: new Date('2026-01-01T00:00:00Z'),
      } as MemoryPinnedFactEntity)
      const result = await service.pinFact({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        fact: 'Ne jamais proposer de régie',
        kind: 'correction',
        origin: 'copilot',
        expiresAt: '2026-12-31T23:00:00.000Z',
      })
      expect(facts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'correction',
          origin: 'copilot',
          expires_at: new Date('2026-12-31T23:00:00.000Z'),
        }),
      )
      expect(result.kind).toBe('correction')
      expect(result.origin).toBe('copilot')
      expect(result.expiresAt).toBe('2026-12-31T23:00:00.000Z')
    })

    it('stores NO deadline when the given one is unreadable (never a guessed expiry)', async () => {
      facts.save.mockResolvedValueOnce({
        id: 'f-4',
        account_id: null,
        fact: 'x',
        kind: 'fact',
        origin: 'manual',
        expires_at: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
      } as MemoryPinnedFactEntity)
      await service.pinFact({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        fact: 'x',
        expiresAt: 'fin d’année',
      })
      expect(facts.create).toHaveBeenCalledWith(expect.objectContaining({ expires_at: null }))
    })

    /**
     * Mesuré en production le 10/09/2026 sur `/settings/memory` : trois faits
     * rendus SIX lignes, toutes « Retenu le 1 sept. 2026 ». Deux paires ne
     * différaient que par la ponctuation, la troisième était un doublon à
     * l'octet près. Aucune déduplication n'existait ; la doctrine interdit de
     * FUSIONNER deux objets métier, mais il ne s'agit pas de ça ici — on
     * empêche une INSERTION en double, ce qui laisse ZÉRO objet supplémentaire
     * à fusionner. `pin_memory_fact` (#1793) écrit par le MÊME chemin : le
     * corriger ici protège les deux appelants, pas seulement le nouveau.
     */
    describe('ne pas insérer un doublon (mesuré le 10/09/2026)', () => {
      const EXISTING = {
        id: 'f-existing',
        account_id: null,
        fact: 'Compter six semaines de cycle de vente.',
        kind: 'fact',
        origin: 'manual',
        expires_at: null,
        created_at: new Date('2026-09-01T00:00:00Z'),
      } as MemoryPinnedFactEntity

      it('un doublon à l’octet près ne crée pas une seconde ligne — la ligne existante est rendue', async () => {
        facts._qb.getMany.mockResolvedValueOnce([EXISTING])
        const result = await service.pinFact({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: null,
          fact: 'Compter six semaines de cycle de vente.',
        })
        expect(facts.create).not.toHaveBeenCalled()
        expect(facts.save).not.toHaveBeenCalled()
        expect(result.id).toBe('f-existing')
      })

      it('un doublon qui ne diffère QUE par la ponctuation (« : » / « — ») n’est pas inséré', async () => {
        facts._qb.getMany.mockResolvedValueOnce([EXISTING])
        const result = await service.pinFact({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: null,
          // Même contenu, séparateur et casse différents — c'est exactement le
          // deuxième doublon mesuré en production.
          fact: 'COMPTER SIX SEMAINES : DE CYCLE DE VENTE',
        })
        expect(facts.create).not.toHaveBeenCalled()
        expect(result.id).toBe('f-existing')
      })

      it("n'attrape pas un fait réellement différent — un mot change le sens, pas juste la ponctuation", async () => {
        facts._qb.getMany.mockResolvedValueOnce([EXISTING])
        facts.save.mockResolvedValueOnce({
          id: 'f-nouveau',
          account_id: null,
          fact: 'Compter huit semaines de cycle de vente.',
          kind: 'fact',
          origin: 'manual',
          expires_at: null,
          created_at: new Date('2026-09-10T00:00:00Z'),
        } as MemoryPinnedFactEntity)
        const result = await service.pinFact({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: null,
          fact: 'Compter huit semaines de cycle de vente.',
        })
        expect(facts.create).toHaveBeenCalled()
        expect(result.id).toBe('f-nouveau')
      })

      it('un même texte épinglé sur DEUX comptes différents (ou un compte contre le global) n’est pas un doublon', async () => {
        // La comparaison porte AUSSI sur `account_id` : un fait de portée
        // GLOBALE et le même texte épinglé sur un compte précis sont deux
        // mémoires différentes, pas la même ligne redite.
        facts._qb.getMany.mockResolvedValueOnce([])
        facts.save.mockResolvedValueOnce({
          id: 'f-scope',
          account_id: 'acc-9',
          fact: EXISTING.fact,
          kind: 'fact',
          origin: 'manual',
          expires_at: null,
          created_at: new Date('2026-09-10T00:00:00Z'),
        } as MemoryPinnedFactEntity)
        const result = await service.pinFact({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: 'acc-9',
          fact: EXISTING.fact,
        })
        expect(facts.create).toHaveBeenCalled()
        expect(result.id).toBe('f-scope')
      })
    })
  })

  describe('unpinFact', () => {
    // #1918.1 — la suppression est bornée par ce que l'APPELANT peut voir : un
    // élément « moi » d'un collègue est hors d'atteinte, même avec son id.
    // #1918.7 — un membre simple ne retire que CE QU'IL A ÉPINGLÉ : le critère
    // de la suppression est l'auteur, pas la visibilité.
    // #2439.10 (21/09/2026) — « oublier » ARCHIVE : la même requête, un UPDATE
    // au lieu d'un DELETE, avec `archived_at IS NULL` en plus pour qu'un second
    // oubli réponde 404. Les bornes de portée ne changent pas d'un caractère.
    it('a plain member archives only what they pinned — workspace, id AND author in the criteria', async () => {
      await service.unpinFact({ id: 'f-1', workspaceId: 'ws-1', userId: 'u-1', role: 'member' })
      expect(facts._qb.update).toHaveBeenCalled()
      expect(facts._qb.set).toHaveBeenCalledWith({ archived_at: expect.any(Date) })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('archived_at IS NULL')
      expect(facts._qb.delete).not.toHaveBeenCalled()
      expect(facts._qb.where).toHaveBeenCalledWith('id = :id', { id: 'f-1' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('workspace_id = :ws', { ws: 'ws-1' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('user_id = :viewer', { viewer: 'u-1' })
      // Plus de `delete({ id, workspace_id })` : ce critère-là ignorait la portée.
      expect(facts.delete).not.toHaveBeenCalled()
    })

    it('#1918.7 — a manager (owner/admin) deletes what they can SEE: shared rows, or their own', async () => {
      for (const role of ['owner', 'admin'] as const) {
        facts._qb.andWhere.mockClear()
        await service.unpinFact({ id: 'f-1', workspaceId: 'ws-1', userId: 'u-1', role })
        expect(facts._qb.andWhere).toHaveBeenCalledWith(
          "(scope = 'workspace' OR (scope = 'user' AND user_id = :viewer))",
          {
            viewer: 'u-1',
          },
        )
      }
    })

    it('without a role, fails CLOSED to the plain-member rule', async () => {
      await service.unpinFact({ id: 'f-1', workspaceId: 'ws-1', userId: 'u-1' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('user_id = :viewer', { viewer: 'u-1' })
    })

    it('#1918.7 — nothing deleted but the row is VISIBLE (a colleague’s shared row): 403', async () => {
      facts._qb.execute.mockResolvedValueOnce({ affected: 0, raw: [] })
      facts._qb.getOne.mockResolvedValueOnce({ id: 'f-shared', scope: 'workspace', user_id: 'u-2' })
      await expect(
        service.unpinFact({ id: 'f-shared', workspaceId: 'ws-1', userId: 'u-1', role: 'member' }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws NotFound when nothing was deleted and nothing is visible (wrong workspace / missing / a colleague’s « moi » row)', async () => {
      facts._qb.execute.mockResolvedValueOnce({ affected: 0, raw: [] })
      facts._qb.getOne.mockResolvedValueOnce(null)
      await expect(
        service.unpinFact({ id: 'f-x', workspaceId: 'ws-1', userId: 'u-1', role: 'admin' }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    /**
     * #1962.28 — une note supprimée ne revient pas via le résumé roulant. Le
     * résumé (`nextSummary`) est un texte DÉTERMINISTE écrit en base, pas
     * régénéré par un modèle : sans ce retrait, sa trace y resterait pour
     * toujours — `getConversationSummary` la relit au tour suivant comme si le
     * fait n'avait jamais été oublié.
     */
    it('#1962.28 — la suppression retire aussi l’exacte trace du fait dans les résumés du même espace', async () => {
      facts.findOne.mockResolvedValueOnce({ id: 'f-1', fact: 'ALTEN ne serait plus sur le compte.' })
      summaries.find.mockResolvedValueOnce([
        { id: 's-1', summary: 'Vu : ALTEN ne serait plus sur le compte. Reste à vérifier.' },
        { id: 's-2', summary: 'Rien à voir ici.' },
      ])
      await service.unpinFact({ id: 'f-1', workspaceId: 'ws-1', userId: 'u-1', role: 'member' })
      // #2439.10 — une ligne ARCHIVÉE n'est plus relue : on ne la récrit pas.
      expect(summaries.find).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', archived_at: IsNull() } })
      expect(summaries.update).toHaveBeenCalledTimes(1)
      expect(summaries.update).toHaveBeenCalledWith('s-1', { summary: 'Vu :  Reste à vérifier.' })
    })

    it('#1962.28 — rien à récrire quand le texte du fait n’apparaît dans aucun résumé', async () => {
      facts.findOne.mockResolvedValueOnce({ id: 'f-1', fact: 'Un fait jamais mentionné en conversation.' })
      summaries.find.mockResolvedValueOnce([{ id: 's-1', summary: 'Rien à voir ici.' }])
      await service.unpinFact({ id: 'f-1', workspaceId: 'ws-1', userId: 'u-1', role: 'member' })
      expect(summaries.update).not.toHaveBeenCalled()
    })

    it('#1962.28 — rien n’est lu ni récrit quand la suppression n’a rien affecté (403/404)', async () => {
      facts._qb.execute.mockResolvedValueOnce({ affected: 0, raw: [] })
      facts._qb.getOne.mockResolvedValueOnce(null)
      await expect(
        service.unpinFact({ id: 'f-x', workspaceId: 'ws-1', userId: 'u-1', role: 'admin' }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(summaries.find).not.toHaveBeenCalled()
    })
  })

  describe('pinFact — la portée (#1918.1)', () => {
    beforeEach(() => {
      // La ligne telle que la base la rend : un id et une date de création.
      facts.save.mockImplementation(async (entity: MemoryPinnedFactEntity) => ({
        ...entity,
        id: 'f-new',
        created_at: new Date('2026-09-12T00:00:00Z'),
      }))
    })

    it('persists the requested scope', async () => {
      await service.pinFact({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        fact: 'Objectif perso',
        scope: 'user',
      })
      expect(facts.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u-1', scope: 'user' }))
    })

    it('an absent scope keeps the historical, SHARED behaviour — never a silent change of visibility', async () => {
      await service.pinFact({ userId: 'u-1', workspaceId: 'ws-1', accountId: null, fact: 'Onglet ancien' })
      expect(facts.create).toHaveBeenCalledWith(expect.objectContaining({ scope: 'workspace' }))
    })

    it('the duplicate check only looks at rows of the SAME scope, and a « moi » duplicate must be the caller’s own', async () => {
      await service.pinFact({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        fact: 'Objectif perso',
        scope: 'user',
      })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('f.scope = :scope', { scope: 'user' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('f.user_id = :viewer', { viewer: 'u-1' })
    })
  })

  describe('setFactScope (#1916.21)', () => {
    it('updates the scope of the CALLER’s own row only — workspace, id AND owner in the criteria', async () => {
      facts.findOne.mockResolvedValueOnce({
        id: 'f-1',
        user_id: 'u-1',
        account_id: null,
        fact: 'x',
        kind: 'fact',
        origin: 'manual',
        scope: 'user',
        expires_at: null,
        created_at: new Date('2026-01-02T00:00:00Z'),
      } as MemoryPinnedFactEntity)
      const result = await service.setFactScope({ id: 'f-1', workspaceId: 'ws-1', userId: 'u-1', scope: 'workspace' })
      expect(facts.update).toHaveBeenCalledWith(
        // #2439.10 — une ligne oubliée ne se re-porte plus : 404 comme une absente.
        { id: 'f-1', workspace_id: 'ws-1', user_id: 'u-1', archived_at: IsNull() },
        { scope: 'workspace' },
      )
      expect(result).toMatchObject({ id: 'f-1', scope: 'workspace', ownedByMe: true })
      // #1916.23 — le geste est journalisé, avec l'espace résolu et son auteur.
      expect(events.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          fact_id: 'f-1',
          actor_user_id: 'u-1',
          event: 'scope_changed',
          previous_value: 'user',
          new_value: 'workspace',
        }),
      )
    })

    it('is a 404 when the row is not the caller’s (or does not exist) — never a silent success', async () => {
      facts.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] })
      await expect(
        service.setFactScope({ id: 'f-1', workspaceId: 'ws-1', userId: 'u-2', scope: 'user' }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('listFacts', () => {
    it('scopes by workspace, and includes global OR the active account when given', async () => {
      facts._qb.getMany.mockResolvedValueOnce([
        {
          id: 'f-1',
          user_id: 'u-2',
          account_id: null,
          fact: 'global',
          kind: 'fact',
          origin: 'manual',
          scope: 'workspace',
          expires_at: null,
          created_at: new Date('2026-01-02T00:00:00Z'),
        },
      ] as MemoryPinnedFactEntity[])
      const result = await service.listFacts({ workspaceId: 'ws-1', userId: 'u-1', accountId: 'a-1' })
      expect(facts._qb.where).toHaveBeenCalledWith('f.workspace_id = :ws', { ws: 'ws-1' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('(f.account_id IS NULL OR f.account_id = :acc)', { acc: 'a-1' })
      expect(result).toEqual([
        {
          id: 'f-1',
          fact: 'global',
          accountId: null,
          kind: 'fact',
          origin: 'manual',
          scope: 'workspace',
          // #1918.2 — aucune portée d'équipe : la ligne ne désigne aucun périmètre.
          businessUnitId: null,
          // #2260.7 — aucun objet visé.
          object: null,
          // Épinglé par un collègue : l'appelant le lit, il n'en est pas le propriétaire.
          ownedByMe: false,
          // #1918.7 — sans rôle de manager, il ne peut pas le retirer.
          canForget: false,
          expiresAt: null,
          createdAt: '2026-01-02T00:00:00.000Z',
          // Q1 (13/09) — une ligne relue sans confirmation n'est pas « confirmée ».
          confirmedAt: null,
        },
      ])
    })

    it('#1918.7 — a manager may forget a colleague’s SHARED row, never a « moi » one', async () => {
      facts._qb.getMany.mockResolvedValueOnce([
        { id: 'f-shared', user_id: 'u-2', scope: 'workspace', fact: 'règle', created_at: new Date() },
        { id: 'f-mine', user_id: 'u-1', scope: 'user', fact: 'moi', created_at: new Date() },
      ] as MemoryPinnedFactEntity[])
      const rows = await service.listFacts({ workspaceId: 'ws-1', userId: 'u-1', role: 'admin' })
      expect(rows.find(row => row.id === 'f-shared')?.canForget).toBe(true)
      expect(rows.find(row => row.id === 'f-mine')?.canForget).toBe(true)
    })

    it('#1918.1 — only reads what the CALLER can see: shared rows, or rows the caller pinned', async () => {
      facts._qb.getMany.mockResolvedValueOnce([])
      await service.listFacts({ workspaceId: 'ws-1', userId: 'u-1' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith(
        "(f.scope = 'workspace' OR (f.scope = 'user' AND f.user_id = :viewer))",
        {
          viewer: 'u-1',
        },
      )
    })

    it('omits the account predicate when no account is active', async () => {
      facts._qb.getMany.mockResolvedValueOnce([])
      await service.listFacts({ workspaceId: 'ws-1', userId: 'u-1' })
      expect(facts._qb.andWhere).not.toHaveBeenCalledWith(
        '(f.account_id IS NULL OR f.account_id = :acc)',
        expect.anything(),
      )
    })

    // ── Un fait EXPIRÉ n'est plus lu (restitution V2 §20) ─────────────────────
    // C'est la SEULE lecture de la mémoire : la carte « Mémoire » comme le
    // contexte du copilote (`ChatContextService.loadMemory`) passent par ici.
    it('excludes expired items — with or without an active account', async () => {
      facts._qb.getMany.mockResolvedValue([])
      await service.listFacts({ workspaceId: 'ws-1', userId: 'u-1' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('(f.expires_at IS NULL OR f.expires_at > now())')

      facts._qb.andWhere.mockClear()
      await service.listFacts({ workspaceId: 'ws-1', userId: 'u-1', accountId: 'a-1' })
      expect(facts._qb.andWhere).toHaveBeenCalledWith('(f.expires_at IS NULL OR f.expires_at > now())')
    })

    it('reads legacy rows (pinned before the migration) with the historical defaults', async () => {
      facts._qb.getMany.mockResolvedValueOnce([
        { id: 'f-old', account_id: null, fact: 'ancien', created_at: new Date('2026-01-02T00:00:00Z') },
      ] as MemoryPinnedFactEntity[])
      const [item] = await service.listFacts({ workspaceId: 'ws-1', userId: 'u-1' })
      // #1918.1 — une ligne sans portée lue par un vieux mock retombe sur le
      // défaut de la migration (`workspace`), jamais sur « moi ».
      expect(item).toMatchObject({ kind: 'fact', origin: 'manual', scope: 'workspace', expiresAt: null })
    })

    /**
     * PREUVE (relecture orchestrateur du 12/09, corrigeant 548e55051) : c'est
     * ICI, et nulle part ailleurs, que la carte « Mémoire » d'un collègue ET
     * `ChatContextService.loadMemory` (→ le prompt du modèle) lisent les faits
     * épinglés. Quel que soit le compte qui a épinglé un élément PARTAGÉ, et
     * quoi que contienne son texte, il ressort tel quel à n'importe quel membre
     * de l'espace — y compris quand cet auteur a été retiré à la suppression de
     * son compte (`user_id` NULL, #1939) : aucune clause n'EXIGE un auteur.
     * Rédiger le TEXTE à la suppression d'un compte aurait donc fait apparaître
     * « [supprimé] » aux collègues et l'aurait envoyé au modèle comme un fait
     * réel — #1939 retire l'AUTEUR, jamais le texte.
     *
     * ⚠️ Avec la portée « Toi uniquement » (#1918.1, décision de Louis du 12/09),
     * la lecture porte UNE clause sur `user_id`, le prédicat de portée
     * `(scope = 'workspace' OR (scope = 'user' AND user_id = :viewer))`. Elle ne retire JAMAIS un
     * élément PARTAGÉ — auteur effacé compris —, elle retire l'élément « moi »
     * d'un AUTRE. Aucune AUTRE clause d'auteur ne s'ajoute.
     */
    it('ne filtre JAMAIS un élément PARTAGÉ par son auteur — auteur effacé compris, le texte ressort identique', async () => {
      facts._qb.getMany.mockResolvedValueOnce([
        {
          id: 'f-orphan',
          user_id: null,
          account_id: null,
          fact: 'DSI décideur, budget validé Q4',
          kind: 'fact',
          origin: 'manual',
          scope: 'workspace',
          expires_at: null,
          created_at: new Date('2026-01-02T00:00:00Z'),
        },
      ] as unknown as MemoryPinnedFactEntity[])
      const [item] = await service.listFacts({ workspaceId: 'ws-1', userId: 'u-any-member' })
      expect(item).toMatchObject({ fact: 'DSI décideur, budget validé Q4', ownedByMe: false })
      const authorClauses = facts._qb.andWhere.mock.calls
        .map(call => String(call[0]))
        .filter(clause => clause.includes('user_id'))
      // La SEULE clause d'auteur est le prédicat de portée, qui admet tout élément partagé.
      expect(authorClauses).toEqual(["(f.scope = 'workspace' OR (f.scope = 'user' AND f.user_id = :viewer))"])
      expect(facts._qb.where).toHaveBeenCalledWith('f.workspace_id = :ws', { ws: 'ws-1' })
    })
  })

  describe('preferences', () => {
    it('returns {} when the user has no preferences row', async () => {
      prefs.findOne.mockResolvedValueOnce(null)
      expect(await service.getPreferences('u-1')).toEqual({})
    })

    it('shallow-merges a patch into the existing bag (upsert)', async () => {
      prefs.findOne.mockResolvedValueOnce({
        id: 'p-1',
        user_id: 'u-1',
        preferences: { tone: 'direct', lang: 'fr' },
      } as unknown as UserPreferenceEntity)
      const merged = await service.patchPreferences('u-1', { tone: 'chaleureux' })
      expect(merged).toEqual({ tone: 'chaleureux', lang: 'fr' })
      expect(prefs.save).toHaveBeenCalledWith(
        expect.objectContaining({ preferences: { tone: 'chaleureux', lang: 'fr' } }),
      )
    })

    it('creates the row on first write', async () => {
      prefs.findOne.mockResolvedValueOnce(null)
      const merged = await service.patchPreferences('u-2', { lang: 'en' })
      expect(merged).toEqual({ lang: 'en' })
      expect(prefs.create).toHaveBeenCalledWith({ user_id: 'u-2', preferences: { lang: 'en' } })
    })
  })

  describe('conversation summary', () => {
    it('reads by (person, workspace, conversation key) and returns null when empty', async () => {
      summaries.findOne.mockResolvedValueOnce(null)
      expect(
        await service.getConversationSummary({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: null,
          conversationId: 'general',
        }),
      ).toBeNull()
      expect(summaries.findOne).toHaveBeenCalledWith({
        where: {
          user_id: 'u-1',
          workspace_id: 'ws-1',
          conversation_id: 'general',
          superseded_at: IsNull(),
          // #2439.10 — un résumé OUBLIÉ n'est plus la ligne vivante de ce fil.
          archived_at: IsNull(),
        },
      })
    })

    it('derives an account-scoped key when no conversationId is given', async () => {
      summaries.findOne.mockResolvedValueOnce(null)
      await service.getConversationSummary({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: 'a-9',
        conversationId: null,
      })
      expect(summaries.findOne).toHaveBeenCalledWith({
        where: {
          user_id: 'u-1',
          workspace_id: 'ws-1',
          conversation_id: 'account:a-9',
          superseded_at: IsNull(),
          // #2439.10 — un résumé OUBLIÉ n'est plus la ligne vivante de ce fil.
          archived_at: IsNull(),
        },
      })
    })

    it('appends a new exchange to the existing summary', async () => {
      summaries.findOne.mockResolvedValueOnce({
        id: 's-1',
        summary: '• Utilisateur : bonjour',
      } as ConversationSummaryEntity)
      await service.appendConversationTurn({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'general',
        userMessage: 'quels comptes ?',
        assistantReply: 'Priorise EDF et SNCF.',
      })
      // L'écriture cherche la ligne avec la MÊME borne que la lecture : une
      // écriture plus large recréerait la ligne partagée entre collègues.
      expect(summaries.findOne).toHaveBeenCalledWith({
        where: {
          user_id: 'u-1',
          workspace_id: 'ws-1',
          conversation_id: 'general',
          superseded_at: IsNull(),
          // #2439.10 — un résumé OUBLIÉ n'est plus la ligne vivante de ce fil.
          archived_at: IsNull(),
        },
      })
      const saved = summaries.save.mock.calls[0][0] as ConversationSummaryEntity
      expect(saved.summary).toContain('• Utilisateur : bonjour')
      expect(saved.summary).toContain('• Utilisateur : quels comptes ?')
      expect(saved.summary).toContain('• BellumAI : Priorise EDF et SNCF.')
    })

    // #1955.30 — le résumé roulant devient LISIBLE à l'écran (`/chat`), pas
    // seulement injecté au prompt : il fallait sa date (`updatedAt`), que
    // `getConversationSummary` (texte seul) ne rend pas.
    describe('getConversationSummaryDetail (#1955.30)', () => {
      it('returns null when no live row exists', async () => {
        summaries.findOne.mockResolvedValueOnce(null)
        expect(
          await service.getConversationSummaryDetail({
            userId: 'u-1',
            workspaceId: 'ws-1',
            accountId: null,
            conversationId: 'general',
          }),
        ).toBeNull()
      })

      it('returns null when the row is empty (a blank summary is not a memory line)', async () => {
        summaries.findOne.mockResolvedValueOnce({
          summary: '   ',
          updated_at: new Date('2026-09-16T10:00:00Z'),
        } as ConversationSummaryEntity)
        expect(
          await service.getConversationSummaryDetail({
            userId: 'u-1',
            workspaceId: 'ws-1',
            accountId: null,
            conversationId: 'general',
          }),
        ).toBeNull()
      })

      it('returns the trimmed text with its last update date', async () => {
        summaries.findOne.mockResolvedValueOnce({
          summary: '• Utilisateur : bonjour  ',
          updated_at: new Date('2026-09-16T10:00:00Z'),
        } as ConversationSummaryEntity)
        expect(
          await service.getConversationSummaryDetail({
            userId: 'u-1',
            workspaceId: 'ws-1',
            accountId: null,
            conversationId: 'general',
          }),
        ).toEqual({
          summary: '• Utilisateur : bonjour',
          updatedAt: '2026-09-16T10:00:00.000Z',
          // #1955.24-.28 — sans état structuré, aucune catégorie ne se remplit.
          sections: { decisions: [], objects: [], pendingActions: [], corrections: [], questions: [] },
        })
      })

      it('#1955.24-.28 — range l’état structuré du MÊME fil par catégorie', async () => {
        summaries.findOne.mockResolvedValueOnce({
          summary: 'Relance SNCF',
          updated_at: new Date('2026-09-16T10:00:00Z'),
          thread_state: {
            version: 1,
            objects: [{ kind: 'account', id: 'a-1', label: 'SNCF' }],
            focus: [],
            last_list: null,
            searches: [],
            proposals: [{ action: 'Préparer la relance', target_kind: null, target_id: null, target_label: null }],
            questions: [{ question: 'Quel budget ?', options: [] }],
            decisions: ['Cibler la DSI'],
            excluded: [{ criterion: 'grands groupes', reason: null }],
          },
        } as unknown as ConversationSummaryEntity)
        const detail = await service.getConversationSummaryDetail({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: null,
          conversationId: 'general',
        })
        expect(detail?.sections).toEqual({
          decisions: ['Cibler la DSI'],
          objects: [{ kind: 'account', label: 'SNCF' }],
          pendingActions: [{ action: 'Préparer la relance', target: null }],
          corrections: [{ kind: 'excluded', text: 'grands groupes', reason: null }],
          questions: ['Quel budget ?'],
        })
      })
    })

    // #1955.31 — « une correction humaine gagne toujours » (CLAUDE.md) : le
    // texte corrigé remplace la ligne vivante, et le tour SUIVANT reprend ce
    // texte comme base au lieu de l'effacer.
    describe('correctConversationSummary (#1955.31)', () => {
      it('refuses to invent a summary that never existed (404, not a silent create)', async () => {
        summaries.findOne.mockResolvedValueOnce(null)
        await expect(
          service.correctConversationSummary({
            userId: 'u-1',
            workspaceId: 'ws-1',
            accountId: null,
            conversationId: 'general',
            summary: 'Un résumé inventé',
          }),
        ).rejects.toThrow(NotFoundException)
        expect(summaries.save).not.toHaveBeenCalled()
      })

      it('trims and saves the corrected text onto the same live row', async () => {
        const existing = {
          id: 's-1',
          summary: '• Utilisateur : bonjour',
          updated_at: new Date('2026-09-15T09:00:00Z'),
        } as ConversationSummaryEntity
        summaries.findOne.mockResolvedValueOnce(existing)
        summaries.save.mockResolvedValueOnce({
          ...existing,
          summary: 'Le bon résumé',
          updated_at: new Date('2026-09-16T11:00:00Z'),
        })
        const result = await service.correctConversationSummary({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: null,
          conversationId: 'general',
          summary: '  Le bon résumé  ',
        })
        expect(summaries.save).toHaveBeenCalledWith(expect.objectContaining({ id: 's-1', summary: 'Le bon résumé' }))
        expect(result).toEqual({
          summary: 'Le bon résumé',
          updatedAt: '2026-09-16T11:00:00.000Z',
          sections: { decisions: [], objects: [], pendingActions: [], corrections: [], questions: [] },
        })
      })

      it('the correction survives the next turn: it becomes the base appendConversationTurn builds on', async () => {
        const corrected = {
          id: 's-1',
          summary: 'Le bon résumé',
          updated_at: new Date('2026-09-16T11:00:00Z'),
        } as ConversationSummaryEntity
        // 1) La correction se pose sur la ligne existante.
        summaries.findOne.mockResolvedValueOnce({ id: 's-1', summary: 'Un résumé bancal' } as ConversationSummaryEntity)
        summaries.save.mockResolvedValueOnce(corrected)
        await service.correctConversationSummary({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: null,
          conversationId: 'general',
          summary: 'Le bon résumé',
        })

        // 2) Le tour suivant relit la ligne CORRIGÉE, pas l'ancienne.
        summaries.findOne.mockResolvedValueOnce(corrected)
        await service.appendConversationTurn({
          userId: 'u-1',
          workspaceId: 'ws-1',
          accountId: null,
          conversationId: 'general',
          userMessage: 'et ensuite ?',
          assistantReply: 'Voici la suite.',
        })
        const saved = summaries.save.mock.calls[1][0] as ConversationSummaryEntity
        expect(saved.summary).toContain('Le bon résumé')
        expect(saved.summary).not.toContain('Un résumé bancal')
      })
    })
  })

  describe('nextSummary (deterministic heuristic)', () => {
    it('caps the total length by keeping the most recent tail', () => {
      const long = Array.from({ length: 50 }, (_, i) => `• Utilisateur : message ${i}`).join('\n')
      const out = nextSummary(long, 'dernier message', 'réponse finale')
      expect(out.length).toBeLessThanOrEqual(2000)
      expect(out).toContain('dernier message')
      expect(out).not.toContain('message 0')
    })

    /**
     * #1905.5 — LE PLAFOND SE TIENT PAR ÉLÉMENT, JAMAIS AU MILIEU D'UN.
     *
     * `kept.slice(kept.length - SUMMARY_MAX_CHARS)` coupait la ligne de tête en
     * plein texte : le modèle recevait un fragment SANS son étiquette de rôle,
     * donc une phrase dont il ne savait plus qui l'avait dite. Un tour entier qui
     * sort est une perte NOMMÉE ; un tour coupé est une phrase FAUSSE.
     */
    it('drops whole exchanges instead of cutting a line in half', () => {
      const long = Array.from({ length: 30 }, (_, i) => `\u2022 Utilisateur : ${'m'.repeat(150)} ${i}`).join('\n')
      const out = nextSummary(long, 'dernier message', 'réponse finale')
      expect(out.length).toBeLessThanOrEqual(2000)
      expect(out).toContain('dernier message')
      // La preuve du NON : sur l'ancienne coupe au caractère, la première ligne
      // est un fragment de « mmm… » qui ne porte plus de puce.
      for (const line of out.split('\n')) expect(line.startsWith('\u2022 ')).toBe(true)
    })

    /**
     * #1905.13 — UNE VALEUR COUPÉE EN DEUX EST UNE VALEUR FAUSSE.
     *
     * `slice(0, TURN_SNIPPET_MAX)` tombait au milieu d'un SIRET : le modèle
     * recevait « 552049447 » comme un identifiant ENTIER. On perd le mot, on ne
     * le déforme jamais — et la perte est marquée, jamais silencieuse.
     */
    it('loses a truncated identifier rather than handing half of one to the model', () => {
      const message = `${'x'.repeat(190)} 55204944701905 fin`
      const out = nextSummary('', message, '')
      expect(out).not.toContain('552049447')
      expect(out).toContain('\u2026')
    })

    /** Le témoin : un tour qui tient dans les bornes repart MOT POUR MOT. */
    it('leaves a short exchange untouched and unmarked', () => {
      const out = nextSummary('', 'le DSI est Paul Martin', 'noté, SIRET 55204944701905')
      expect(out).toBe('\u2022 Utilisateur : le DSI est Paul Martin\n\u2022 BellumAI : noté, SIRET 55204944701905')
      expect(out).not.toContain('\u2026')
    })

    /**
     * #1905.5 — une ligne HÉRITÉE plus large que le plafond (écrite par l'ancienne
     * coupe) se borne elle aussi par MOT, depuis son début : elle garde sa puce et
     * annonce ce qui manque, au lieu de commencer au milieu d'un mot.
     */
    it('bounds a single oversized legacy line on a word, from its start', () => {
      const legacy = `\u2022 Utilisateur : ${Array.from({ length: 600 }, (_, i) => `mot${i}`).join(' ')}`
      const out = nextSummary(legacy, '', '')
      expect(out.length).toBeLessThanOrEqual(2000)
      expect(out.startsWith('\u2022 Utilisateur : mot0 mot1 ')).toBe(true)
      expect(out.endsWith('\u2026')).toBe(true)
      // Aucun mot rendu à moitié : chaque « motN » est complet.
      for (const token of out.split(' ').filter(t => t.startsWith('mot'))) {
        expect(token).toMatch(/^mot\d+$/)
      }
    })
  })
})
