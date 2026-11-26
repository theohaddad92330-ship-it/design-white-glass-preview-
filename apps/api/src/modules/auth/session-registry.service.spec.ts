import { MAX_ACTIVE_DEVICES } from '@bellum/contracts'
import { SessionRegistryService } from './session-registry.service'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

function session(partial: Partial<UserSessionEntity>): UserSessionEntity {
  return {
    id: 'sess',
    user_id: 'u1',
    device_id: 'dev',
    ip: null,
    user_agent: null,
    created_at: new Date('2026-07-16T00:00:00Z'),
    last_seen_at: new Date('2026-07-16T00:00:00Z'),
    revoked_at: null,
    ...partial,
  }
}

/** `count` active devices, most recently seen first: `s-1` (newest) … `s-<count>` (oldest). */
function devices(count: number): UserSessionEntity[] {
  return Array.from({ length: count }, (_, i) =>
    session({ id: `s-${i + 1}`, device_id: `dev-${i + 1}`, last_seen_at: new Date(Date.UTC(2026, 6, 16, 12 - i)) }),
  )
}

describe('SessionRegistryService', () => {
  let sessions: MockRepository<UserSessionEntity>
  let notifications: MockRepository<NotificationEntity>
  let workspaces: MockRepository<WorkspaceEntity>
  let service: SessionRegistryService

  beforeEach(() => {
    sessions = createMockRepository<UserSessionEntity>()
    notifications = createMockRepository<NotificationEntity>()
    workspaces = createMockRepository<WorkspaceEntity>()
    // Default: a regular (non-demo) account — the capped path stays the norm.
    workspaces.count.mockResolvedValue(0)
    service = new SessionRegistryService(sessions as never, notifications as never, workspaces as never)
  })

  describe('registerAndEnforce', () => {
    // R15-7 (15/09/2026) — décision de Louis : cinq appareils. À deux, le Mac en
    // veille la nuit sautait à la première connexion du matin sur le téléphone.
    it('the 6th device revokes only the least recently seen one (cap of 5)', async () => {
      sessions.find.mockResolvedValueOnce(devices(6))
      await service.registerAndEnforce('u1', 'dev-new', '1.2.3.4', 'UA')

      expect(sessions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u1', device_id: 'dev-new', ip: '1.2.3.4', revoked_at: null }),
        expect.objectContaining({ conflictPaths: ['user_id', 'device_id'] }),
      )
      // Only the excess beyond MAX_ACTIVE_DEVICES is revoked.
      const [criteria, patch] = sessions.update.mock.calls[0]
      expect(patch).toEqual(expect.objectContaining({ revoked_at: expect.any(Date) }))
      // criteria.id is a TypeORM In(...) FindOperator; its public `.value` holds the ids.
      expect((criteria as { id: { value: string[] } }).id.value).toEqual(['s-6'])
    })

    it('the 5th device keeps its session — a Mac asleep overnight survives a phone sign-in (R15-7)', async () => {
      sessions.find.mockResolvedValueOnce(devices(5))
      await service.registerAndEnforce('u1', 'dev-5', null, null)
      expect(sessions.update).not.toHaveBeenCalled()
      expect(MAX_ACTIVE_DEVICES).toBe(5)
    })

    it('raises a sharing nudge when 2+ devices are active from distinct IPs (once)', async () => {
      sessions.find.mockResolvedValueOnce([
        session({ id: 's1', ip: '1.1.1.1', last_seen_at: new Date() }),
        session({ id: 's2', ip: '2.2.2.2', last_seen_at: new Date() }),
      ])
      notifications.count.mockResolvedValueOnce(0) // not recently notified
      await service.registerAndEnforce('u1', 'dev', '1.1.1.1', 'UA')
      expect(notifications.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'system', link: '/settings/team' }),
      )
    })

    it('does not nudge again within the cooldown', async () => {
      sessions.find.mockResolvedValueOnce([
        session({ id: 's1', ip: '1.1.1.1', last_seen_at: new Date() }),
        session({ id: 's2', ip: '2.2.2.2', last_seen_at: new Date() }),
      ])
      notifications.count.mockResolvedValueOnce(1) // already notified recently
      await service.registerAndEnforce('u1', 'dev', '1.1.1.1', 'UA')
      expect(notifications.save).not.toHaveBeenCalled()
    })

    describe('shared demo account (the demo link is handed to many prospects)', () => {
      beforeEach(() => workspaces.count.mockResolvedValue(1)) // owns an is_demo workspace

      it('registers the device but never evicts — prospect #3 must not kick prospect #1', async () => {
        sessions.find.mockResolvedValueOnce(devices(6))

        await service.registerAndEnforce('demo-user', 'dev-3', '3.3.3.3', 'UA')

        expect(sessions.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ user_id: 'demo-user', device_id: 'dev-3' }),
          expect.anything(),
        )
        expect(sessions.update).not.toHaveBeenCalled()
      })

      it('does not raise the password-sharing nudge — sharing is the point', async () => {
        sessions.find.mockResolvedValueOnce([
          session({ id: 's1', ip: '1.1.1.1', last_seen_at: new Date() }),
          session({ id: 's2', ip: '2.2.2.2', last_seen_at: new Date() }),
        ])
        notifications.count.mockResolvedValueOnce(0)

        await service.registerAndEnforce('demo-user', 'dev', '1.1.1.1', 'UA')

        expect(notifications.save).not.toHaveBeenCalled()
      })

      it('keeps the cap when the workspace lookup fails (fails closed)', async () => {
        workspaces.count.mockRejectedValueOnce(new Error('db down'))
        sessions.find.mockResolvedValueOnce(devices(6))

        await service.registerAndEnforce('u1', 'dev', null, null)

        expect(sessions.update).toHaveBeenCalled()
      })
    })
  })

  describe('isRevoked', () => {
    it('is true only for an existing, revoked row', async () => {
      sessions.findOne.mockResolvedValueOnce(session({ revoked_at: new Date() }))
      expect(await service.isRevoked('u1', 'dev')).toBe(true)
    })
    it('is false for an active row', async () => {
      sessions.findOne.mockResolvedValueOnce(session({ revoked_at: null }))
      expect(await service.isRevoked('u1', 'dev')).toBe(false)
    })
    it('is false for a missing row (grandfathered session)', async () => {
      sessions.findOne.mockResolvedValueOnce(null)
      expect(await service.isRevoked('u1', 'dev')).toBe(false)
    })
  })

  // Audit H2 : sans cookie `bellum_did` (ou avec un UUID neuf), la révocation ne
  // se rattache plus à une ligne d'appareil : on la rattache au jeton (iat).
  describe('isRevoked — jeton sans appareil connu (audit H2)', () => {
    const iat = new Date('2026-07-16T10:00:00Z')
    it('sans cookie : révoqué si une session du compte a été révoquée depuis l’émission du jeton', async () => {
      sessions.count.mockResolvedValueOnce(1)
      expect(await service.isRevoked('u1', null, iat)).toBe(true)
      expect(sessions.findOne).not.toHaveBeenCalled()
    })
    it('sans cookie : valide si aucune révocation depuis l’émission du jeton', async () => {
      sessions.count.mockResolvedValueOnce(0)
      expect(await service.isRevoked('u1', null, iat)).toBe(false)
    })
    it('UUID neuf (aucune ligne) : même contrôle par l’iat', async () => {
      sessions.findOne.mockResolvedValueOnce(null)
      sessions.count.mockResolvedValueOnce(1)
      expect(await service.isRevoked('u1', 'uuid-neuf', iat)).toBe(true)
    })
    it('sans cookie ni iat : pas de contrôle possible, valide', async () => {
      expect(await service.isRevoked('u1', null)).toBe(false)
    })
  })

  describe('list + revoke', () => {
    it('marks the current device and maps rows', async () => {
      sessions.find.mockResolvedValueOnce([
        session({ id: 's1', device_id: 'dev-a', ip: '1.1.1.1' }),
        session({ id: 's2', device_id: 'dev-b', ip: '2.2.2.2' }),
      ])
      const list = await service.list('u1', 'dev-a')
      expect(list[0]).toEqual(expect.objectContaining({ id: 's1', current: true }))
      expect(list[1]).toEqual(expect.objectContaining({ id: 's2', current: false }))
    })

    it('revokes a session scoped to the owner', async () => {
      await service.revoke('u1', 's-x')
      expect(sessions.update).toHaveBeenCalledWith(
        { id: 's-x', user_id: 'u1' },
        expect.objectContaining({ revoked_at: expect.any(Date) }),
      )
    })
  })
})
