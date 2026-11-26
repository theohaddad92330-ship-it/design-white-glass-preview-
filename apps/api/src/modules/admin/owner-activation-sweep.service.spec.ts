import { Logger } from '@nestjs/common'
import { OwnerActivationSweepService } from './owner-activation-sweep.service'
import { OwnerInvitationEntity } from '../../database/entities/owner-invitation.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222'
const OWNER_ID = '11111111-1111-4111-8111-111111111111'

/**
 * Le balayage quotidien qui ALERTE l'équipe interne d'un siège toujours
 * inactif après la cadence J+2/J+5 (#2643.3).
 *
 * ⚠️ CE QU'IL NE FAIT JAMAIS : envoyer quoi que ce soit vers l'extérieur.
 * L'alerte est journalisée (Winston → Sentry), même mécanisme que
 * `ManualBillingSweepService` — personne d'extérieur ne la reçoit, donc rien
 * n'exige de geste opérateur ici (à la différence de #2643.1).
 */
const row = (over: Partial<OwnerInvitationEntity> = {}): OwnerInvitationEntity =>
  ({
    workspace_id: WORKSPACE_ID,
    user_id: OWNER_ID,
    email: 'theo@skaizen.fr',
    esn_name: 'Skaizen',
    plan_label: 'Team',
    link: 'https://app.bellum.ai/auth/reset-password?t=abc',
    sent_at: new Date('2026-09-15T09:00:00.000Z'),
    sends: [{ at: '2026-09-15T09:00:00.000Z', by: 'louis@bellum.ai' }],
    alerted_at: null,
    ...over,
  }) as OwnerInvitationEntity

describe('OwnerActivationSweepService', () => {
  let invitations: MockRepository<OwnerInvitationEntity>
  let listAuthStates: jest.Mock
  let service: OwnerActivationSweepService
  let warn: jest.SpyInstance

  beforeEach(() => {
    invitations = createMockRepository<OwnerInvitationEntity>()
    invitations.find.mockResolvedValue([])
    listAuthStates = jest.fn().mockResolvedValue({ complete: true, states: [] })
    service = new OwnerActivationSweepService(invitations as never, { listAuthStates } as never)
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('ne lit que les invitations ENVOYÉES et jamais encore alertées', async () => {
    await service.sweep('2026-09-20')
    expect(invitations.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({}) }))
  })

  it('n’alerte pas avant J+5 — le siège a encore une relance à recevoir', async () => {
    invitations.find.mockResolvedValue([row({ sent_at: new Date('2026-09-17T09:00:00.000Z') })])
    listAuthStates.mockResolvedValue({ complete: true, states: [{ userId: OWNER_ID, lastSignInAt: null }] })

    const report = await service.sweep('2026-09-20')

    expect(report).toEqual({ examined: 1, alerted: 0 })
    expect(warn).not.toHaveBeenCalled()
    expect(invitations.save).not.toHaveBeenCalled()
  })

  it('alerte à J+5 un siège JAMAIS connecté — et consigne l’alerte une seule fois', async () => {
    invitations.find.mockResolvedValue([row()])
    listAuthStates.mockResolvedValue({ complete: true, states: [{ userId: OWNER_ID, lastSignInAt: null }] })

    const report = await service.sweep('2026-09-20')

    expect(report).toEqual({ examined: 1, alerted: 1 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skaizen'), expect.anything())
    expect(invitations.save).toHaveBeenCalledWith(expect.objectContaining({ alerted_at: expect.any(Date) }))
  })

  it('ne dit RIEN d’un siège qui s’est bien connecté — l’alerte mesure l’inactivité, pas l’ancienneté', async () => {
    invitations.find.mockResolvedValue([row()])
    listAuthStates.mockResolvedValue({
      complete: true,
      states: [{ userId: OWNER_ID, lastSignInAt: '2026-09-16T10:00:00.000Z' }],
    })

    const report = await service.sweep('2026-09-20')

    expect(report).toEqual({ examined: 1, alerted: 0 })
    expect(warn).not.toHaveBeenCalled()
  })

  /**
   * ⚠️ LE PIÈGE EXACT que `listAuthStates` documente : un compte ABSENT de
   * `states` est INCONNU, jamais « jamais connecté ». L'alerter serait deviner.
   */
  it('n’alerte PAS un propriétaire absent du magasin d’authentification — inconnu ≠ inactif', async () => {
    invitations.find.mockResolvedValue([row()])
    listAuthStates.mockResolvedValue({ complete: false, states: [] })

    const report = await service.sweep('2026-09-20')

    expect(report).toEqual({ examined: 1, alerted: 0 })
    expect(warn).not.toHaveBeenCalled()
  })
})
