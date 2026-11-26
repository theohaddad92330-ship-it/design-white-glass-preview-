import { OwnerActivationService } from './owner-activation.service'
import { OwnerInvitationEntity } from '../../database/entities/owner-invitation.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'

describe('OwnerActivationService', () => {
  let repo: MockRepository<OwnerInvitationEntity>
  let sendOwnerInvitationEmail: jest.Mock
  let service: OwnerActivationService

  beforeEach(() => {
    repo = createMockRepository<OwnerInvitationEntity>()
    sendOwnerInvitationEmail = jest.fn().mockResolvedValue(undefined)
    service = new OwnerActivationService(repo as never, { sendOwnerInvitationEmail } as never)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PERSISTER (#2643.2) — l'état survit à la réponse HTTP de provisionnement
   * ═══════════════════════════════════════════════════════════════════════
   */
  describe('persist', () => {
    it('écrit une ligne neuve pour un espace qui n’en a pas encore', async () => {
      repo.findOne.mockResolvedValue(null)

      await service.persist({
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        email: 'theo@skaizen.fr',
        ownerFirstName: 'Théo',
        esnName: 'Skaizen',
        planLabel: 'Team',
        link: 'https://app.bellum.ai/auth/reset-password?t=abc',
        expiresAt: '2026-09-22T10:00:00.000Z',
        error: null,
      })

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: WORKSPACE_ID,
          user_id: OWNER_ID,
          email: 'theo@skaizen.fr',
          esn_name: 'Skaizen',
          link: 'https://app.bellum.ai/auth/reset-password?t=abc',
          sent_at: null,
          sends: [],
        }),
      )
    })

    it('met À JOUR la ligne existante plutôt que d’en écrire une seconde — un espace, une invitation', async () => {
      const existing: Partial<OwnerInvitationEntity> = {
        id: 'row-1',
        workspace_id: WORKSPACE_ID,
        sent_at: null,
        sends: [],
      }
      repo.findOne.mockResolvedValue(existing as OwnerInvitationEntity)

      await service.persist({
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        email: 'theo@skaizen.fr',
        ownerFirstName: null,
        esnName: 'Skaizen',
        planLabel: 'Team',
        link: null,
        expiresAt: null,
        error: 'Génération du lien impossible : rate limited.',
      })

      expect(repo.save).toHaveBeenCalledTimes(1)
      const saved = repo.save.mock.calls[0][0] as Partial<OwnerInvitationEntity>
      expect(saved.id).toBe('row-1')
      expect(saved.error).toContain('rate limited')
    })
  })

  describe('getState', () => {
    it('rend null quand aucune invitation n’a été préparée pour cet espace', async () => {
      repo.findOne.mockResolvedValue(null)
      expect(await service.getState(WORKSPACE_ID)).toBeNull()
    })

    it('rend l’état PRÉPARÉ mais jamais envoyé', async () => {
      repo.findOne.mockResolvedValue({
        workspace_id: WORKSPACE_ID,
        email: 'theo@skaizen.fr',
        esn_name: 'Skaizen',
        plan_label: 'Team',
        link: 'https://app.bellum.ai/auth/reset-password?t=abc',
        expires_at: new Date('2026-09-22T10:00:00.000Z'),
        error: null,
        sent_at: null,
        sent_by: null,
        sends: [],
        alerted_at: null,
      } as unknown as OwnerInvitationEntity)

      const state = await service.getState(WORKSPACE_ID)
      expect(state).toMatchObject({
        prepared: true,
        sentAt: null,
        sentBy: null,
        sendCount: 0,
      })
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ENVOYER (#2643.1) — jamais silencieux : UNIQUEMENT sur ce clic opérateur.
   * ═══════════════════════════════════════════════════════════════════════
   */
  describe('send', () => {
    it('refuse quand aucune invitation n’a été préparée pour cet espace', async () => {
      repo.findOne.mockResolvedValue(null)

      const result = await service.send(WORKSPACE_ID, 'louis@bellum.ai')

      expect(result).toEqual({ sent: false, reason: 'not_found' })
      expect(sendOwnerInvitationEmail).not.toHaveBeenCalled()
    })

    it('refuse quand le lien n’a pas pu être engendré — jamais un e-mail inutilisable', async () => {
      repo.findOne.mockResolvedValue({
        workspace_id: WORKSPACE_ID,
        link: null,
        email: 'theo@skaizen.fr',
        esn_name: 'Skaizen',
        plan_label: 'Team',
        sends: [],
      } as unknown as OwnerInvitationEntity)

      const result = await service.send(WORKSPACE_ID, 'louis@bellum.ai')

      expect(result).toEqual({ sent: false, reason: 'no_link' })
      expect(sendOwnerInvitationEmail).not.toHaveBeenCalled()
    })

    it('envoie l’e-mail préparé, et CONSIGNE qui a cliqué, quand', async () => {
      const row: Partial<OwnerInvitationEntity> = {
        workspace_id: WORKSPACE_ID,
        email: 'theo@skaizen.fr',
        owner_first_name: 'Théo',
        esn_name: 'Skaizen',
        plan_label: 'Team',
        link: 'https://app.bellum.ai/auth/reset-password?t=abc',
        expires_at: new Date('2026-09-22T10:00:00.000Z'),
        error: null,
        sent_at: null,
        sent_by: null,
        sends: [],
        alerted_at: null,
      }
      repo.findOne.mockResolvedValue(row as OwnerInvitationEntity)

      const result = await service.send(WORKSPACE_ID, 'louis@bellum.ai')

      expect(sendOwnerInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'theo@skaizen.fr',
          subject: expect.stringContaining('Skaizen'),
          body: expect.stringContaining('https://app.bellum.ai/auth/reset-password?t=abc'),
        }),
      )
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sent_at: expect.any(Date),
          sent_by: 'louis@bellum.ai',
          sends: [expect.objectContaining({ by: 'louis@bellum.ai' })],
        }),
      )
      expect(result.sent).toBe(true)
      if (result.sent) expect(result.state.sentBy).toBe('louis@bellum.ai')
    })

    it('une relance ALLONGE l’historique — elle ne remplace pas le premier envoi', async () => {
      const row: Partial<OwnerInvitationEntity> = {
        workspace_id: WORKSPACE_ID,
        email: 'theo@skaizen.fr',
        esn_name: 'Skaizen',
        plan_label: 'Team',
        link: 'https://app.bellum.ai/auth/reset-password?t=abc',
        expires_at: null,
        error: null,
        sent_at: new Date('2026-09-18T09:00:00.000Z'),
        sent_by: 'louis@bellum.ai',
        sends: [{ at: '2026-09-18T09:00:00.000Z', by: 'louis@bellum.ai' }],
        alerted_at: null,
      }
      repo.findOne.mockResolvedValue(row as OwnerInvitationEntity)

      // J+2 pile — la première relance est due.
      const result = await service.send(WORKSPACE_ID, 'louis@bellum.ai', '2026-09-20')

      expect(result.sent).toBe(true)
      if (result.sent) expect(result.state.sendCount).toBe(2)
    })

    /**
     * ═══════════════════════════════════════════════════════════════════
     * LA CADENCE J+2/J+5 (#2643.3) — n'engage QUE les relances, jamais
     * l'envoi initial (préparé, jamais encore envoyé).
     * ═══════════════════════════════════════════════════════════════════
     */
    it('refuse une relance AVANT J+2 — la cadence n’est pas une suggestion', async () => {
      const row: Partial<OwnerInvitationEntity> = {
        workspace_id: WORKSPACE_ID,
        email: 'theo@skaizen.fr',
        esn_name: 'Skaizen',
        plan_label: 'Team',
        link: 'https://app.bellum.ai/auth/reset-password?t=abc',
        expires_at: null,
        error: null,
        sent_at: new Date('2026-09-19T09:00:00.000Z'),
        sent_by: 'louis@bellum.ai',
        sends: [{ at: '2026-09-19T09:00:00.000Z', by: 'louis@bellum.ai' }],
        alerted_at: null,
      }
      repo.findOne.mockResolvedValue(row as OwnerInvitationEntity)

      const result = await service.send(WORKSPACE_ID, 'louis@bellum.ai', '2026-09-20')

      expect(result).toEqual({ sent: false, reason: 'not_due_yet' })
      expect(sendOwnerInvitationEmail).not.toHaveBeenCalled()
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('refuse une TROISIÈME relance — la cadence est épuisée à deux', async () => {
      const row: Partial<OwnerInvitationEntity> = {
        workspace_id: WORKSPACE_ID,
        email: 'theo@skaizen.fr',
        esn_name: 'Skaizen',
        plan_label: 'Team',
        link: 'https://app.bellum.ai/auth/reset-password?t=abc',
        expires_at: null,
        error: null,
        sent_at: new Date('2026-09-01T09:00:00.000Z'),
        sent_by: 'louis@bellum.ai',
        sends: [
          { at: '2026-09-01T09:00:00.000Z', by: 'louis@bellum.ai' },
          { at: '2026-09-03T09:00:00.000Z', by: 'louis@bellum.ai' },
          { at: '2026-09-06T09:00:00.000Z', by: 'louis@bellum.ai' },
        ],
        alerted_at: null,
      }
      repo.findOne.mockResolvedValue(row as OwnerInvitationEntity)

      const result = await service.send(WORKSPACE_ID, 'louis@bellum.ai', '2026-09-30')

      expect(result).toEqual({ sent: false, reason: 'cadence_exhausted' })
      expect(sendOwnerInvitationEmail).not.toHaveBeenCalled()
    })

    it('l’envoi INITIAL n’est JAMAIS soumis à la cadence — seules les relances le sont', async () => {
      const row: Partial<OwnerInvitationEntity> = {
        workspace_id: WORKSPACE_ID,
        email: 'theo@skaizen.fr',
        esn_name: 'Skaizen',
        plan_label: 'Team',
        link: 'https://app.bellum.ai/auth/reset-password?t=abc',
        expires_at: null,
        error: null,
        sent_at: null,
        sent_by: null,
        sends: [],
        alerted_at: null,
      }
      repo.findOne.mockResolvedValue(row as OwnerInvitationEntity)

      const result = await service.send(WORKSPACE_ID, 'louis@bellum.ai', '2026-09-20')

      expect(result.sent).toBe(true)
      expect(sendOwnerInvitationEmail).toHaveBeenCalled()
    })
  })
})
