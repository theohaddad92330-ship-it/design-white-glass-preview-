import { PrivacyExportService } from './privacy-export.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { NotificationSmsChannelEntity } from '../../database/entities/notification-sms-channel.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const USER = 'user-123'

type Repos = {
  profiles: MockRepository<ProfileEntity>
  esnProfiles: MockRepository<EsnProfileEntity>
  subscriptions: MockRepository<SubscriptionEntity>
  accounts: MockRepository<AccountEntity>
  contacts: MockRepository<ContactEntity>
  consultants: MockRepository<ConsultantEntity>
  ragDocuments: MockRepository<RagDocumentEntity>
  actions: MockRepository<UserActionEntity>
  creditLedger: MockRepository<CreditLedgerEntity>
  sessions: MockRepository<UserSessionEntity>
  smsChannels: MockRepository<NotificationSmsChannelEntity>
}

function makeService(): { service: PrivacyExportService; repos: Repos } {
  const repos: Repos = {
    profiles: createMockRepository<ProfileEntity>(),
    esnProfiles: createMockRepository<EsnProfileEntity>(),
    subscriptions: createMockRepository<SubscriptionEntity>(),
    accounts: createMockRepository<AccountEntity>(),
    contacts: createMockRepository<ContactEntity>(),
    consultants: createMockRepository<ConsultantEntity>(),
    ragDocuments: createMockRepository<RagDocumentEntity>(),
    actions: createMockRepository<UserActionEntity>(),
    creditLedger: createMockRepository<CreditLedgerEntity>(),
    sessions: createMockRepository<UserSessionEntity>(),
    smsChannels: createMockRepository<NotificationSmsChannelEntity>(),
  }
  const service = new PrivacyExportService(
    repos.profiles as never,
    repos.esnProfiles as never,
    repos.subscriptions as never,
    repos.accounts as never,
    repos.contacts as never,
    repos.consultants as never,
    repos.ragDocuments as never,
    repos.actions as never,
    repos.creditLedger as never,
    repos.sessions as never,
    repos.smsChannels as never,
  )
  return { service, repos }
}

describe('PrivacyExportService', () => {
  it('aggregates all personal-data tables scoped to the user', async () => {
    const { service, repos } = makeService()
    repos.profiles.findOne.mockResolvedValue({ user_id: USER, email: 'me@corp.co' })
    repos.subscriptions.findOne.mockResolvedValue({ user_id: USER, plan: 'team' })
    repos.esnProfiles.find.mockResolvedValue([{ id: 'e1', user_id: USER }])
    repos.accounts.find.mockResolvedValue([{ id: 'a1', user_id: USER }])
    repos.contacts.find.mockResolvedValue([{ id: 'c1', user_id: USER }])
    repos.ragDocuments.find.mockResolvedValue([{ id: 'r1', user_id: USER }])
    repos.actions.find.mockResolvedValue([{ id: 'ac1', user_id: USER }])
    repos.creditLedger.find.mockResolvedValue([{ id: 'l1', owner_user_id: USER }])
    repos.sessions.find.mockResolvedValue([{ id: 's1', user_id: USER }])

    const result = await service.buildExport(USER)

    expect(result.userId).toBe(USER)
    expect(typeof result.exportedAt).toBe('string')
    expect(result.profile).toEqual({ user_id: USER, email: 'me@corp.co' })
    expect(result.subscription).toEqual({ user_id: USER, plan: 'team' })
    expect(result.esnProfiles).toHaveLength(1)
    expect(result.accounts).toHaveLength(1)
    expect(result.contacts).toHaveLength(1)
    expect(result.ragDocuments).toHaveLength(1)
    expect(result.actions).toHaveLength(1)
    expect(result.creditLedger).toHaveLength(1)
    expect(result.sessions).toHaveLength(1)
  })

  it('inclut le VIVIER — un export sans les talents est un export troué', async () => {
    const { service, repos } = makeService()
    repos.consultants.find.mockResolvedValue([{ id: 'c1', full_name: 'Yanis Berthier' }])
    const result = await service.buildExport(USER)
    expect(result.consultants).toEqual([{ id: 'c1', full_name: 'Yanis Berthier' }])
    expect(repos.consultants.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER } }))
  })

  it('pins every query to the authenticated user (no cross-tenant read)', async () => {
    const { service, repos } = makeService()
    await service.buildExport(USER)

    expect(repos.profiles.findOne).toHaveBeenCalledWith({ where: { user_id: USER } })
    expect(repos.subscriptions.findOne).toHaveBeenCalledWith({ where: { user_id: USER } })
    expect(repos.esnProfiles.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER } }))
    expect(repos.accounts.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER } }))
    expect(repos.contacts.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER } }))
    expect(repos.ragDocuments.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER } }))
    expect(repos.actions.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER } }))
    expect(repos.sessions.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER } }))
    // The ledger keys on owner OR actor — still only the caller's own rows.
    expect(repos.creditLedger.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: [{ owner_user_id: USER }, { actor_user_id: USER }] }),
    )
  })

  it('returns nulls for absent profile / subscription rows', async () => {
    const { service, repos } = makeService()
    repos.profiles.findOne.mockResolvedValue(null)
    repos.subscriptions.findOne.mockResolvedValue(null)

    const result = await service.buildExport(USER)

    expect(result.profile).toBeNull()
    expect(result.subscription).toBeNull()
    expect(result.contacts).toEqual([])
  })

  /**
   * #1938.4 — décision Louis 13/09 batch 13. Le numéro saisi pour les alertes
   * SMS est une donnée personnelle : il figure dans l'export (art. 15 & 20),
   * avec sa vérification et les choix. Le code en attente n'y figure PAS — c'est
   * un secret, pas une donnée de la personne, et l'export ne le LIT même pas.
   */
  describe('canal SMS (#1938.4)', () => {
    it('emporte le numéro, sa vérification et les choix — lus par user_id seul', async () => {
      const { service, repos } = makeService()
      const channel = {
        user_id: USER,
        phone_e164: '+33612345678',
        phone_verified_at: new Date('2026-09-13T08:00:00.000Z'),
        consent_at: new Date('2026-09-13T08:05:00.000Z'),
        sms_buy_signal: false,
        sms_credit_low: true,
        sms_action_overdue: false,
      }
      repos.smsChannels.findOne.mockResolvedValue(channel)

      const result = await service.buildExport(USER)

      expect(result.smsChannel).toEqual(channel)
      expect(repos.smsChannels.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER } }))
    })

    it('ne LIT jamais l’empreinte du code de vérification', async () => {
      const { service, repos } = makeService()
      await service.buildExport(USER)
      const [options] = repos.smsChannels.findOne.mock.calls[0] as [{ select?: string[] }]
      expect(options.select).toBeDefined()
      expect(options.select).toContain('phone_e164')
      expect(options.select).not.toContain('verification_code_hash')
      expect(options.select).not.toContain('verification_expires_at')
    })

    it('rend null sans numéro enregistré', async () => {
      const { service } = makeService()
      const result = await service.buildExport(USER)
      expect(result.smsChannel).toBeNull()
    })
  })
})
