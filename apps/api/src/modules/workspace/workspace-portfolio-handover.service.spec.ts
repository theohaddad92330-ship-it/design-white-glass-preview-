import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PORTFOLIO_HANDOVER_KINDS } from '@bellum/contracts'
import { WorkspacePortfolioHandoverService } from './workspace-portfolio-handover.service'

/**
 * LA REPRISE D'UN PORTEFEUILLE — tome 8 §33, angle mort n°2.
 *
 * Ce que ces tests tiennent :
 *
 *  1. **L'isolation.** Toute lecture et toute écriture portent `workspace_id`.
 *     Un `UPDATE … WHERE owner = :partant` sans l'espace réattribuerait le
 *     portefeuille d'un homonyme dans une AUTRE ESN.
 *  2. **Le zéro qui ment.** Un comptage tombé rend `null`, jamais `0` — sur le
 *     geste le plus irréversible de l'écran, « il ne porte rien » et « je n'ai
 *     pas su compter » ne peuvent pas s'écrire pareil.
 *  3. **La ligne.** Ce qui se transmet est le PORTAGE ; la messagerie, l'agenda
 *     et les conversations restent personnels (D58, D65) et sont NOMMÉS.
 *  4. **On n'écrit pas au hasard.** Un successeur hors de l'espace, le sortant
 *     lui-même, ou un rôle qui ne porte aucun portefeuille sont refusés AVANT
 *     la moindre écriture.
 */
describe('WorkspacePortfolioHandoverService', () => {
  const WS = 'w-1'
  const PARTANT = '11111111-1111-4111-8111-111111111111'
  const REPRENEUR = '22222222-2222-4222-8222-222222222222'

  type RepoStub = { count: jest.Mock; update: jest.Mock; delete: jest.Mock; remove: jest.Mock }

  // #4158.29 — `action_plan_items` : pas de `workspace_id`, donc un query builder
  // dont on enregistre les clauses (la borne d'espace passe par le COMPTE).
  type ActionItemsStub = {
    update: jest.Mock
    delete: jest.Mock
    remove: jest.Mock
    qb: Record<string, jest.Mock>
    createQueryBuilder: jest.Mock
    clauses: string[]
    params: Array<Record<string, unknown>>
  }
  const actionItemsRepo = (count = 0, ids: string[] = []): ActionItemsStub => {
    const clauses: string[] = []
    const params: Array<Record<string, unknown>> = []
    const qb: Record<string, jest.Mock> = {}
    const chain = (clause: string, p?: Record<string, unknown>) => {
      clauses.push(clause)
      if (p) params.push(p)
      return qb
    }
    qb.where = jest.fn(chain)
    qb.andWhere = jest.fn(chain)
    qb.update = jest.fn(() => qb)
    qb.set = jest.fn(() => qb)
    qb.getCount = jest.fn().mockResolvedValue(count)
    qb.execute = jest.fn().mockResolvedValue({ affected: ids.length })
    return {
      update: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      qb,
      createQueryBuilder: jest.fn(() => qb),
      clauses,
      params,
    }
  }

  // `delete` et `remove` sont CÂBLÉS et doivent rester muets : un test qui
  // vérifie l'absence d'une méthode que le double n'a pas de toute façon ne
  // garde rien. Les poser ici, c'est ce qui permet au test « on archive, on ne
  // supprime pas » de dire NON.
  const repo = (count = 0, affected = 0): RepoStub => ({
    count: jest.fn().mockResolvedValue(count),
    update: jest.fn().mockResolvedValue({ affected }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
  })

  const build = (
    over: {
      memberRoles?: Record<string, string>
      accounts?: RepoStub
      contacts?: RepoStub
      tasks?: RepoStub
      opportunities?: RepoStub
      needs?: RepoStub
      missions?: RepoStub
      actionItems?: ActionItemsStub
      extraPermissions?: jest.Mock
    } = {},
  ) => {
    const roles: Record<string, string> = over.memberRoles ?? { [PARTANT]: 'sales', [REPRENEUR]: 'sales' }
    const rows = Object.entries(roles).map(([user_id, role]) => ({
      workspace_id: WS,
      user_id,
      role,
      created_at: new Date('2026-03-02T09:00:00.000Z'),
    }))
    const members = {
      findOne: jest.fn(async ({ where }: { where: { user_id: string } }) =>
        rows.find(row => row.user_id === where.user_id),
      ),
      find: jest.fn().mockResolvedValue(rows),
    }
    const profiles = {
      findOne: jest.fn().mockResolvedValue({ user_id: PARTANT, email: 'partant@esn.fr', first_name: 'Camille' }),
      find: jest.fn().mockResolvedValue([{ user_id: REPRENEUR, email: 'reprend@esn.fr', first_name: 'Alix' }]),
    }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'owner' }),
      assertPermission: jest.fn().mockResolvedValue(undefined),
      extraPermissionsOf: over.extraPermissions ?? jest.fn().mockResolvedValue([]),
    }
    const analytics = { track: jest.fn() }
    const repos = {
      accounts: over.accounts ?? repo(12, 12),
      contacts: over.contacts ?? repo(31, 31),
      tasks: over.tasks ?? repo(4, 4),
      opportunities: over.opportunities ?? repo(2, 2),
      needs: over.needs ?? repo(1, 1),
      missions: over.missions ?? repo(0, 0),
      actionItems: over.actionItems ?? actionItemsRepo(3, ['a1', 'a2', 'a3']),
    }
    const service = new WorkspacePortfolioHandoverService(
      workspaceContext as never,
      members as never,
      profiles as never,
      repos.accounts as never,
      repos.contacts as never,
      repos.tasks as never,
      repos.opportunities as never,
      repos.needs as never,
      repos.missions as never,
      repos.actionItems as never,
      analytics as never,
    )
    return { service, members, profiles, workspaceContext, analytics, repos }
  }

  /* ------------------------------------------------------------------ */
  /*  La prévisualisation                                                */
  /* ------------------------------------------------------------------ */

  describe('preview — ce qu’un membre porte, avant de décider', () => {
    it('rend une entrée par nature, toujours les mêmes, dans l’ordre du contrat', async () => {
      const { service } = build()

      const preview = await service.preview('u-manager', PARTANT)

      expect(preview.holdings.map(h => h.kind)).toEqual([...PORTFOLIO_HANDOVER_KINDS])
    })

    it('compte le portefeuille EN BORNANT à l’espace — jamais par le seul porteur', async () => {
      const { service, repos } = build()

      await service.preview('u-manager', PARTANT)

      expect(repos.accounts.count).toHaveBeenCalledWith({ where: { workspace_id: WS, assigned_to: PARTANT } })
      expect(repos.missions.count).toHaveBeenCalledWith({ where: { workspace_id: WS, owner_id: PARTANT } })
    })

    it('un comptage tombé rend `null` — « je n’ai pas su compter » n’est pas « il ne porte rien »', async () => {
      const broken = repo()
      broken.count.mockRejectedValue(new Error('pg down'))
      const { service } = build({ accounts: broken })

      const preview = await service.preview('u-manager', PARTANT)

      expect(preview.holdings.find(h => h.kind === 'accounts')?.count).toBeNull()
      // …et un vrai zéro reste `0` : c'est une mesure.
      expect(preview.holdings.find(h => h.kind === 'missions')?.count).toBe(0)
    })

    it('NOMME ce qui ne se transmet pas — la boîte mail en tête (D58, D65)', async () => {
      const { service } = build()

      const preview = await service.preview('u-manager', PARTANT)

      expect(preview.personal).toContain('mailbox')
      expect(preview.holdings.map(h => h.kind)).not.toContain('mailbox')
    })

    it('propose comme successeurs les membres qui portent un portefeuille, jamais le sortant', async () => {
      const { service } = build({
        memberRoles: { [PARTANT]: 'sales', [REPRENEUR]: 'sales', 'u-lecteur': 'viewer' },
      })

      const preview = await service.preview('u-manager', PARTANT)

      expect(preview.eligibleSuccessors.map(m => m.userId)).toEqual([REPRENEUR])
    })

    it('un accord nominatif suffit à recevoir un portefeuille — même dérivation que l’écriture', async () => {
      const { service } = build({
        memberRoles: { [PARTANT]: 'sales', [REPRENEUR]: 'viewer' },
        extraPermissions: jest.fn(async (_ws: string, user: string) => (user === REPRENEUR ? ['analysis:run'] : [])),
      })

      const preview = await service.preview('u-manager', PARTANT)

      expect(preview.eligibleSuccessors.map(m => m.userId)).toEqual([REPRENEUR])
    })

    it('exige `team:manage` avant de montrer le portefeuille de quelqu’un', async () => {
      const { service, workspaceContext } = build()

      await service.preview('u-manager', PARTANT)

      expect(workspaceContext.assertPermission).toHaveBeenCalledWith('u-manager', WS, 'team:manage')
    })

    it('refuse un membre qui n’appartient pas à l’espace', async () => {
      const { service, members } = build()
      members.findOne.mockResolvedValue(undefined)

      await expect(service.preview('u-manager', PARTANT)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Le transfert                                                       */
  /* ------------------------------------------------------------------ */

  describe('handOver — le geste explicite', () => {
    it('réattribue chaque nature, bornée à l’espace ET au porteur sortant', async () => {
      const { service, repos } = build()

      await service.handOver('u-manager', PARTANT, REPRENEUR)

      expect(repos.accounts.update).toHaveBeenCalledWith(
        { workspace_id: WS, assigned_to: PARTANT },
        { assigned_to: REPRENEUR },
      )
      expect(repos.tasks.update).toHaveBeenCalledWith({ workspace_id: WS, owner_id: PARTANT }, { owner_id: REPRENEUR })
    })

    it('rend ce qui a RÉELLEMENT changé de main', async () => {
      const { service } = build()

      const result = await service.handOver('u-manager', PARTANT, REPRENEUR)

      expect(result).toMatchObject({ fromUserId: PARTANT, toUserId: REPRENEUR })
      expect(result.transferred.find(h => h.kind === 'contacts')?.count).toBe(31)
    })

    it('une écriture tombée rend `null` et n’arrête pas les autres — un transfert partiel se DIT', async () => {
      const broken = repo()
      broken.update.mockRejectedValue(new Error('pg'))
      const { service, repos } = build({ accounts: broken })

      const result = await service.handOver('u-manager', PARTANT, REPRENEUR)

      expect(result.transferred.find(h => h.kind === 'accounts')?.count).toBeNull()
      expect(repos.contacts.update).toHaveBeenCalled()
    })

    it('un pilote qui ne rend pas son compte de lignes rend `null`, pas `0`', async () => {
      const silent = repo()
      silent.update.mockResolvedValue({})
      const { service } = build({ accounts: silent })

      const result = await service.handOver('u-manager', PARTANT, REPRENEUR)

      expect(result.transferred.find(h => h.kind === 'accounts')?.count).toBeNull()
    })

    it('refuse un successeur hors de l’espace AVANT toute écriture', async () => {
      const { service, members, repos } = build()
      members.findOne.mockImplementation(async ({ where }: { where: { user_id: string } }) =>
        where.user_id === PARTANT
          ? { workspace_id: WS, user_id: PARTANT, role: 'sales', created_at: new Date(0) }
          : undefined,
      )

      await expect(service.handOver('u-manager', PARTANT, REPRENEUR)).rejects.toBeInstanceOf(BadRequestException)
      expect(repos.accounts.update).not.toHaveBeenCalled()
    })

    it('refuse de transférer un portefeuille à son propre porteur', async () => {
      const { service, repos } = build()

      await expect(service.handOver('u-manager', PARTANT, PARTANT)).rejects.toBeInstanceOf(BadRequestException)
      expect(repos.accounts.update).not.toHaveBeenCalled()
    })

    it('refuse un successeur qui ne porte aucun portefeuille — un lecteur seul', async () => {
      const { service, repos } = build({ memberRoles: { [PARTANT]: 'sales', [REPRENEUR]: 'viewer' } })

      await expect(service.handOver('u-manager', PARTANT, REPRENEUR)).rejects.toBeInstanceOf(BadRequestException)
      expect(repos.accounts.update).not.toHaveBeenCalled()
    })

    it('refuse un sortant qui n’est pas membre', async () => {
      const { service, members } = build()
      members.findOne.mockResolvedValue(undefined)

      await expect(service.handOver('u-manager', PARTANT, REPRENEUR)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('exige `team:manage` — ce n’est pas un geste de commercial', async () => {
      const { service, workspaceContext } = build()

      await service.handOver('u-manager', PARTANT, REPRENEUR)

      expect(workspaceContext.assertPermission).toHaveBeenCalledWith('u-manager', WS, 'team:manage')
    })

    it('SUPPRIME zéro ligne — on archive, on ne supprime pas', async () => {
      const { service, repos } = build()

      await service.handOver('u-manager', PARTANT, REPRENEUR)

      // Les doubles EXPOSENT `delete` et `remove` : si le service se mettait à
      // les appeler, ce test tomberait — c'est ce qui le distingue d'un test
      // qui constate l'absence d'une méthode jamais posée.
      for (const stub of Object.values(repos)) {
        expect(stub.delete).not.toHaveBeenCalled()
        expect(stub.remove).not.toHaveBeenCalled()
      }
    })

    it('inscrit le geste au journal — qui a donné quoi à qui', async () => {
      const { service, analytics } = build()

      await service.handOver('u-manager', PARTANT, REPRENEUR)

      expect(analytics.track).toHaveBeenCalledWith(
        'portfolio_handed_over',
        expect.objectContaining({ userId: 'u-manager', workspaceId: WS }),
      )
    })

    it('un journal en panne ne fait pas échouer un transfert déjà écrit', async () => {
      const { service, analytics } = build()
      analytics.track.mockImplementation(() => {
        throw new Error('journal down')
      })

      await expect(service.handOver('u-manager', PARTANT, REPRENEUR)).resolves.toMatchObject({ toUserId: REPRENEUR })
    })
  })

  /* ------------------------------------------------------------------ */
  /*  #4158.29 — actions ouvertes, relances, répartition par lots        */
  /* ------------------------------------------------------------------ */

  describe('#4158.29 — actions et relances ouvertes', () => {
    it('compte les actions ouvertes BORNÉES PAR LE COMPTE de l’espace — jamais par le seul porteur', async () => {
      const actionItems = actionItemsRepo(5)
      const { service } = build({ actionItems })

      const preview = await service.preview('u-manager', PARTANT)

      expect(preview.holdings.find(h => h.kind === 'actions')?.count).toBe(5)
      const bound = actionItems.clauses.find(c => c.includes('FROM accounts'))
      expect(bound).toContain('a.workspace_id = :workspaceId')
      expect(actionItems.params.some(p => p.workspaceId === WS)).toBe(true)
      // ouvertes seulement : l'historique garde son délégataire
      expect(actionItems.clauses.join(' ')).toContain("NOT IN ('done', 'obsolete')")
    })

    it('un comptage d’actions tombé rend `null`, pas `0`', async () => {
      const actionItems = actionItemsRepo(0)
      actionItems.qb.getCount.mockRejectedValue(new Error('pg'))
      const { service } = build({ actionItems })

      const preview = await service.preview('u-manager', PARTANT)

      expect(preview.holdings.find(h => h.kind === 'actions')?.count).toBeNull()
    })

    it('le transfert réattribue les actions ouvertes en UN update borné par le compte de l’espace', async () => {
      const actionItems = actionItemsRepo(2, ['a1', 'a2'])
      const { service } = build({ actionItems })

      const result = await service.handOver('u-manager', PARTANT, REPRENEUR)

      expect(actionItems.qb.set).toHaveBeenCalledWith({ assigned_to: REPRENEUR })
      expect(actionItems.clauses.join(' ')).toContain('FROM accounts a WHERE a.workspace_id = :workspaceId')
      expect(actionItems.update).not.toHaveBeenCalled()
      expect(result.transferred.find(h => h.kind === 'actions')?.count).toBe(2)
    })
  })

  describe('#4158.29 — plan() : répartir par lots, récapitulatif avant validation', () => {
    const AUTRE = '33333333-3333-4333-8333-333333333333'
    const roles = { [PARTANT]: 'sales', [REPRENEUR]: 'sales', [AUTRE]: 'sales' }

    it('sans confirmation : compte par nature ET par destinataire, n’écrit RIEN', async () => {
      const { service, repos } = build({ memberRoles: roles })

      const result = await service.plan('u-manager', PARTANT, {
        confirm: false,
        allocations: [
          { kind: 'accounts', toUserId: REPRENEUR },
          { kind: 'contacts', toUserId: AUTRE },
        ],
      })

      expect(result.confirmed).toBe(false)
      expect(result.lines).toEqual([
        { kind: 'accounts', toUserId: REPRENEUR, count: 12 },
        { kind: 'contacts', toUserId: AUTRE, count: 31 },
      ])
      expect(repos.accounts.update).not.toHaveBeenCalled()
      expect(repos.contacts.update).not.toHaveBeenCalled()
    })

    it('confirmé : chaque nature va à SON destinataire, bornée à l’espace et au partant', async () => {
      const { service, repos } = build({ memberRoles: roles })

      const result = await service.plan('u-manager', PARTANT, {
        confirm: true,
        allocations: [
          { kind: 'accounts', toUserId: REPRENEUR },
          { kind: 'contacts', toUserId: AUTRE },
        ],
      })

      expect(result.confirmed).toBe(true)
      expect(repos.accounts.update).toHaveBeenCalledWith(
        { workspace_id: WS, assigned_to: PARTANT },
        { assigned_to: REPRENEUR },
      )
      expect(repos.contacts.update).toHaveBeenCalledWith(
        { workspace_id: WS, assigned_to: PARTANT },
        { assigned_to: AUTRE },
      )
      expect(repos.tasks.update).not.toHaveBeenCalled()
    })

    it('un lot avec identifiants ne touche que ces objets, toujours dans l’espace', async () => {
      const { service, repos } = build({ memberRoles: roles })
      const id = '44444444-4444-4444-8444-444444444444'

      await service.plan('u-manager', PARTANT, {
        confirm: true,
        allocations: [{ kind: 'accounts', toUserId: REPRENEUR, ids: [id] }],
      })

      const [where] = repos.accounts.update.mock.calls[0] as [Record<string, unknown>]
      expect(where.workspace_id).toBe(WS)
      expect(where.assigned_to).toBe(PARTANT)
      expect(where.id).toBeDefined()
    })

    it('refuse AVANT toute écriture : destinataire hors espace, lecteur seul, le partant lui-même', async () => {
      const { service, repos } = build({ memberRoles: { ...roles, [AUTRE]: 'viewer' } })

      await expect(
        service.plan('u-manager', PARTANT, { confirm: true, allocations: [{ kind: 'accounts', toUserId: AUTRE }] }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        service.plan('u-manager', PARTANT, { confirm: true, allocations: [{ kind: 'accounts', toUserId: PARTANT }] }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        service.plan('u-manager', PARTANT, {
          confirm: true,
          allocations: [{ kind: 'accounts', toUserId: '99999999-9999-4999-8999-999999999999' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(repos.accounts.update).not.toHaveBeenCalled()
    })

    it('refuse deux lots « tout » sur la même nature, ou « tout » mêlé à des identifiants', async () => {
      const { service, repos } = build({ memberRoles: roles })
      const id = '44444444-4444-4444-8444-444444444444'

      await expect(
        service.plan('u-manager', PARTANT, {
          confirm: true,
          allocations: [
            { kind: 'accounts', toUserId: REPRENEUR },
            { kind: 'accounts', toUserId: AUTRE },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        service.plan('u-manager', PARTANT, {
          confirm: true,
          allocations: [
            { kind: 'accounts', toUserId: REPRENEUR },
            { kind: 'accounts', toUserId: AUTRE, ids: [id] },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        service.plan('u-manager', PARTANT, {
          confirm: true,
          allocations: [
            { kind: 'accounts', toUserId: REPRENEUR, ids: [id] },
            { kind: 'accounts', toUserId: AUTRE, ids: [id] },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(repos.accounts.update).not.toHaveBeenCalled()
    })

    it('un comptage tombé reste `null` dans le récapitulatif', async () => {
      const broken = repo()
      broken.count.mockRejectedValue(new Error('pg'))
      const { service } = build({ memberRoles: roles, accounts: broken })

      const result = await service.plan('u-manager', PARTANT, {
        confirm: false,
        allocations: [{ kind: 'accounts', toUserId: REPRENEUR }],
      })

      expect(result.lines[0]?.count).toBeNull()
    })

    it('exige `team:manage` et un sortant membre de l’espace actif (autre espace → 404)', async () => {
      const { service, workspaceContext, members } = build({ memberRoles: roles })
      await service.plan('u-manager', PARTANT, {
        confirm: false,
        allocations: [{ kind: 'accounts', toUserId: REPRENEUR }],
      })
      expect(workspaceContext.assertPermission).toHaveBeenCalledWith('u-manager', WS, 'team:manage')

      members.findOne.mockResolvedValue(undefined)
      await expect(
        service.plan('u-manager', PARTANT, {
          confirm: false,
          allocations: [{ kind: 'accounts', toUserId: REPRENEUR }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
