import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { NotificationSmsChannelEntity } from '../../database/entities/notification-sms-channel.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'

/**
 * Les colonnes du canal SMS qui SONT des données de la personne (#1938.4) : le
 * numéro, sa vérification, le consentement et les choix. L'empreinte du code en
 * attente, son échéance et son compteur d'essais n'en font pas partie — ce sont
 * les rouages d'un secret, et l'export ne les lit même pas.
 */
const SMS_CHANNEL_EXPORTED_COLUMNS = [
  'user_id',
  'phone_e164',
  'phone_verified_at',
  'consent_at',
  'sms_buy_signal',
  'sms_credit_low',
  'sms_action_overdue',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof NotificationSmsChannelEntity)[]

/**
 * A complete, machine-readable copy of one user's personal data (RGPD art. 15
 * droit d'accès + art. 20 portabilité). Every field is the user's OWN data;
 * nothing here is scoped to a workspace or another tenant.
 */
export type PrivacyExport = {
  /** RFC 3339 timestamp the export was generated. */
  exportedAt: string
  /** The subject of the export — the authenticated user's id. */
  userId: string
  /** Identity row (email, name, avatar, profile context). */
  profile: ProfileEntity | null
  /** Every version of the ESN questionnaire the user filled in. */
  esnProfiles: EsnProfileEntity[]
  /** Billing state (plan, quotas, Stripe references — the user's own). */
  subscription: SubscriptionEntity | null
  /** Prospect companies the user researched. */
  accounts: AccountEntity[]
  /** Prospect contacts the user collected. */
  contacts: ContactEntity[]
  /**
   * Talents the user entered in the vivier — consultants and candidates.
   *
   * Missing until 2026-08-20 even though arbitrage #7 of 16/08 promised the
   * wiring: an access request returned an export with a hole in it, and the
   * hole was the most personal table of the lot (a CV in plain text).
   */
  consultants: ConsultantEntity[]
  /** Uploaded knowledge documents (embeddings excluded — not personal data). */
  ragDocuments: RagDocumentEntity[]
  /** Commercial actions the user logged (emails sent, calls, plan steps…). */
  actions: UserActionEntity[]
  /** Credit-pool movements the user owns or triggered. */
  creditLedger: CreditLedgerEntity[]
  /** Active/known devices (anti password-sharing registry). */
  sessions: UserSessionEntity[]
  /**
   * #1938.4 — the mobile number entered for urgent SMS alerts, its verification
   * and the chosen alert types. `null` when no number was ever entered.
   */
  smsChannel: Pick<NotificationSmsChannelEntity, (typeof SMS_CHANNEL_EXPORTED_COLUMNS)[number]> | null
}

/**
 * Aggregates ALL of a user's personal data into a single downloadable object.
 *
 * Every query is STRICTLY scoped to the authenticated `userId` (or, for the
 * credit ledger, to the rows the user owns or triggered) — no workspace-wide
 * reads, so a user can never export another tenant's data. Reuses the existing
 * TypeORM repositories rather than duplicating query logic.
 */
@Injectable()
export class PrivacyExportService {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(EsnProfileEntity)
    private readonly esnProfiles: Repository<EsnProfileEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(RagDocumentEntity)
    private readonly ragDocuments: Repository<RagDocumentEntity>,
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
    @InjectRepository(CreditLedgerEntity)
    private readonly creditLedger: Repository<CreditLedgerEntity>,
    @InjectRepository(UserSessionEntity)
    private readonly sessions: Repository<UserSessionEntity>,
    // #1938.4 — ajouté en DERNIER : les specs construisent ce service par
    // position, et un paramètre inséré au milieu décalerait tous les autres.
    @InjectRepository(NotificationSmsChannelEntity)
    private readonly smsChannels: Repository<NotificationSmsChannelEntity>,
  ) {}

  /**
   * Build the export for `userId`. All reads run in parallel; each is pinned to
   * the caller so the payload only ever contains their own data.
   */
  async buildExport(userId: string): Promise<PrivacyExport> {
    const [
      profile,
      esnProfiles,
      subscription,
      accounts,
      contacts,
      consultants,
      ragDocuments,
      actions,
      creditLedger,
      sessions,
      smsChannel,
    ] = await Promise.all([
      this.profiles.findOne({ where: { user_id: userId } }),
      this.esnProfiles.find({ where: { user_id: userId }, order: { version: 'ASC' } }),
      this.subscriptions.findOne({ where: { user_id: userId } }),
      this.accounts.find({ where: { user_id: userId }, order: { created_at: 'ASC' } }),
      this.contacts.find({ where: { user_id: userId }, order: { created_at: 'ASC' } }),
      this.consultants.find({ where: { user_id: userId }, order: { created_at: 'ASC' } }),
      this.ragDocuments.find({ where: { user_id: userId }, order: { created_at: 'ASC' } }),
      this.actions.find({ where: { user_id: userId }, order: { created_at: 'ASC' } }),
      // The ledger keys on the billing owner + the actor: return rows the user
      // owns OR personally triggered, never the whole workspace pool.
      this.creditLedger.find({
        where: [{ owner_user_id: userId }, { actor_user_id: userId }],
        order: { created_at: 'ASC' },
      }),
      this.sessions.find({ where: { user_id: userId }, order: { last_seen_at: 'DESC' } }),
      this.smsChannels.findOne({ where: { user_id: userId }, select: [...SMS_CHANNEL_EXPORTED_COLUMNS] }),
    ])

    return {
      exportedAt: new Date().toISOString(),
      userId,
      profile: profile ?? null,
      esnProfiles,
      subscription: subscription ?? null,
      accounts,
      contacts,
      consultants,
      ragDocuments,
      actions,
      creditLedger,
      sessions,
      smsChannel: smsChannel ?? null,
    }
  }
}
