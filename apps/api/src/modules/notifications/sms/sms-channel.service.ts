import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  SMS_NOTIFICATION_TYPES,
  isSmsNotificationType,
  smsChannelWithoutNumber,
  type NotificationType,
  type SmsChannelSettings,
  type SmsChannelStatus,
  type SmsNotificationType,
  type UpdateSmsTypeOptIns,
} from '@bellum/contracts'
import { killSwitchCut } from '../../../common/kill-switches'
import { NotificationSmsChannelEntity } from '../../../database/entities/notification-sms-channel.entity'
import { smsRecipientRefusal } from './sms-recipient'
import { SMS_SENDER, type SmsSender } from './sms-sender'

/** Un code vaut dix minutes. */
const CODE_TTL_MS = 10 * 60_000
/** Une minute entre deux codes : chaque envoi coûte, et un bouton martelé ne
 *  doit ni vider un budget ni inonder un téléphone. */
const RESEND_COOLDOWN_MS = 60_000
/** Cinq essais par code, puis il faut en redemander un. */
const MAX_ATTEMPTS = 5
/** Un seul segment SMS. */
const SMS_MAX_LENGTH = 160

type OptInColumn = 'sms_buy_signal' | 'sms_credit_low' | 'sms_action_overdue'

const OPT_IN_COLUMN: Readonly<Record<SmsNotificationType, OptInColumn>> = {
  buy_signal: 'sms_buy_signal',
  credit_low: 'sms_credit_low',
  action_overdue: 'sms_action_overdue',
}

/**
 * LE CANAL SMS DES ALERTES URGENTES — #1938.4, décision Louis 13/09 batch 13.
 *
 * Trois règles, et l'ordre des gardes de `dispatch` les suit :
 *  1. **sans fournisseur, NO-OP STRICT** — ni lecture de base, ni appel réseau ;
 *  2. un SMS ne part qu'à une personne dont le numéro est VÉRIFIÉ, qui a
 *     CONSENTI, pour un type URGENT qu'elle a coché elle-même ;
 *  3. le numéro est une donnée personnelle — lu par son propriétaire, jamais
 *     journalisé, jamais écrit en base sous forme de code en clair.
 *
 * La démonstration est décidée par l'appelant (`NotificationsController`, qui
 * lit `WorkspaceContextService.isDemoWorkspace`) et passée en paramètre : ce
 * service ne dépend d'aucun module voisin (GA-07).
 */
@Injectable()
export class SmsChannelService {
  private readonly logger = new Logger(SmsChannelService.name)

  constructor(
    @InjectRepository(NotificationSmsChannelEntity)
    private readonly channels: Repository<NotificationSmsChannelEntity>,
    @Inject(SMS_SENDER) private readonly sender: SmsSender,
  ) {}

  /** Ce que le canal peut faire maintenant, pour cet utilisateur. */
  status(isDemo: boolean): SmsChannelStatus {
    if (isDemo) return 'demo'
    if (!this.sender.configured) return 'coming_soon'
    if (killSwitchCut('notifications.sms')) return 'paused'
    return 'ready'
  }

  /** Les réglages de la personne. En démonstration, la table n'est même pas lue. */
  async getSettings(userId: string, isDemo: boolean): Promise<SmsChannelSettings> {
    const status = this.status(isDemo)
    if (status === 'demo') return smsChannelWithoutNumber('demo')
    // Lue même sans fournisseur : une ligne écrite du temps où un fournisseur
    // était branché doit rester visible — et RETIRABLE — après son retrait.
    const row = await this.channels.findOne({ where: { user_id: userId } })
    return toSettings(status, row)
  }

  /**
   * La demande de code — le SEUL chemin par lequel un numéro entre. Elle passe
   * par le même port que les alertes : sans fournisseur, elle est refusée avant
   * d'écrire quoi que ce soit.
   */
  async startVerification(userId: string, phone: string, isDemo: boolean): Promise<SmsChannelSettings> {
    assertCanSend(this.status(isDemo))
    const now = new Date()
    const existing = await this.channels.findOne({ where: { user_id: userId } })
    if (
      existing?.verification_sent_at &&
      now.getTime() - existing.verification_sent_at.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new HttpException(
        'Un code vient de partir : attends une minute avant d’en demander un autre.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    // Un consentement ne se transfère pas d'un numéro à l'autre : un numéro
    // nouveau repart non vérifié, sans aucun type coché.
    const numberChanged = !existing || existing.phone_e164 !== phone
    const row = this.channels.create({
      ...(existing ?? {}),
      user_id: userId,
      phone_e164: phone,
      ...(numberChanged
        ? {
            phone_verified_at: null,
            consent_at: null,
            sms_buy_signal: false,
            sms_credit_low: false,
            sms_action_overdue: false,
          }
        : {}),
      verification_code_hash: hashCode(userId, code),
      verification_expires_at: new Date(now.getTime() + CODE_TTL_MS),
      verification_sent_at: now,
      verification_attempts: 0,
    })
    const saved = await this.channels.save(row)

    try {
      await this.sender.send({ to: phone, text: `Ton code de vérification : ${code}. Il expire dans 10 minutes.` })
    } catch (error) {
      // Un envoi sans réponse n'est pas un échec certain (le code peut être
      // parti) : le code reste valable, et la minute d'attente protège d'une
      // relance en rafale.
      this.logger.warn('SMS verification code not sent', { user: { id: userId }, error: withoutPhoneNumbers(error) })
      throw new ServiceUnavailableException('Le code n’a pas pu partir. Réessaie dans une minute.')
    }
    return toSettings('ready', saved)
  }

  /** La saisie du code reçu. Vérifier n'est pas consentir : aucun type ne se coche ici. */
  async confirmVerification(userId: string, code: string, isDemo: boolean): Promise<SmsChannelSettings> {
    if (isDemo) throw demoRefusal()
    const row = await this.channels.findOne({ where: { user_id: userId } })
    if (!row?.verification_code_hash || !row.verification_expires_at) {
      throw new BadRequestException('Aucun code en attente : demande un nouveau code.')
    }
    if (row.verification_expires_at.getTime() <= Date.now()) {
      await this.channels.save(withoutPendingCode(row))
      throw new BadRequestException('Ce code a expiré : demande un nouveau code.')
    }
    if (!sameDigest(row.verification_code_hash, hashCode(userId, code))) {
      const attempts = row.verification_attempts + 1
      if (attempts >= MAX_ATTEMPTS) {
        await this.channels.save(withoutPendingCode(row))
        throw new BadRequestException('Trop d’essais : demande un nouveau code.')
      }
      await this.channels.save({ ...row, verification_attempts: attempts })
      throw new BadRequestException('Code incorrect.')
    }

    const saved = await this.channels.save({ ...withoutPendingCode(row), phone_verified_at: new Date() })
    return toSettings(this.status(false), saved)
  }

  /**
   * Les choix, type par type. Cocher demande un numéro vérifié et un canal
   * prêt ; DÉCOCHER est toujours possible — un retrait ne dépend jamais d'un
   * fournisseur ni d'un interrupteur.
   */
  async updateTypes(userId: string, patch: UpdateSmsTypeOptIns, isDemo: boolean): Promise<SmsChannelSettings> {
    const status = this.status(isDemo)
    if (status === 'demo') throw demoRefusal()
    const turningOn = SMS_NOTIFICATION_TYPES.filter(type => patch[type] === true)
    if (turningOn.length > 0) assertCanSend(status)

    const row = await this.channels.findOne({ where: { user_id: userId } })
    if (turningOn.length > 0 && !row?.phone_verified_at) {
      throw new ConflictException('Vérifie d’abord ton numéro avec le code reçu par SMS.')
    }
    if (!row) return smsChannelWithoutNumber(status)

    const next: NotificationSmsChannelEntity = { ...row }
    for (const type of SMS_NOTIFICATION_TYPES) {
      const value = patch[type]
      if (typeof value === 'boolean') next[OPT_IN_COLUMN[type]] = value
    }
    const anyOn = SMS_NOTIFICATION_TYPES.some(type => next[OPT_IN_COLUMN[type]])
    next.consent_at = !anyOn ? null : turningOn.length > 0 ? new Date() : row.consent_at
    const saved = await this.channels.save(next)
    return toSettings(status, saved)
  }

  /** « Ne plus recevoir de SMS » : numéro, vérification et choix partent d'un coup. */
  async withdraw(userId: string): Promise<void> {
    await this.channels.delete({ user_id: userId })
  }

  /**
   * Relaie une notification in-app par SMS, si — et seulement si — tout le
   * permet. Ne lève JAMAIS : une alerte manquée par SMS ne doit pas faire
   * échouer la notification in-app qui l'a déclenchée.
   */
  async dispatch(userId: string, notification: { type: NotificationType; title: string }): Promise<void> {
    // #1938.4 — décision Louis 13/09 batch 13 : un type URGENT seulement, et
    // sans fournisseur on s'arrête ICI — avant toute lecture et tout réseau.
    if (!isSmsNotificationType(notification.type)) return
    if (!this.sender.configured) return
    try {
      if (killSwitchCut('notifications.sms')) return
      const row = await this.channels.findOne({ where: { user_id: userId } })
      if (!row || !row[OPT_IN_COLUMN[notification.type]]) return
      // #4016 L12 — numéro vérifié, consentement daté, pays autorisé : relus à
      // CHAQUE envoi, par la même règle que les alertes Découvrir.
      const refusal = smsRecipientRefusal({
        phone: row.phone_e164,
        verifiedAt: row.phone_verified_at,
        consentAt: row.consent_at,
        countryAllowed: this.sender.allowsCountry(row.phone_e164),
      })
      if (refusal) return
      await this.sender.send({ to: row.phone_e164, text: alertText(notification.title) })
    } catch (error) {
      this.logger.warn('Urgent SMS alert not sent (non-fatal)', {
        user: { id: userId },
        type: notification.type,
        error: withoutPhoneNumbers(error),
      })
    }
  }
}

function assertCanSend(status: SmsChannelStatus): void {
  if (status === 'demo') throw demoRefusal()
  if (status === 'coming_soon') throw new ServiceUnavailableException('L’envoi de SMS n’est pas encore disponible.')
  if (status === 'paused') throw new ServiceUnavailableException('L’envoi de SMS est en pause pour le moment.')
}

function demoRefusal(): ForbiddenException {
  return new ForbiddenException('Espace de démonstration : aucun numéro n’y est enregistré, aucun SMS n’en part.')
}

function toSettings(status: SmsChannelStatus, row: NotificationSmsChannelEntity | null): SmsChannelSettings {
  if (!row) return smsChannelWithoutNumber(status)
  return {
    status,
    phone: row.phone_e164,
    verified_at: row.phone_verified_at ? row.phone_verified_at.toISOString() : null,
    verification_pending: Boolean(
      row.verification_code_hash && row.verification_expires_at && row.verification_expires_at.getTime() > Date.now(),
    ),
    consent_at: row.consent_at ? row.consent_at.toISOString() : null,
    types: {
      buy_signal: row.sms_buy_signal,
      credit_low: row.sms_credit_low,
      action_overdue: row.sms_action_overdue,
    },
  }
}

function withoutPendingCode(row: NotificationSmsChannelEntity): NotificationSmsChannelEntity {
  return {
    ...row,
    verification_code_hash: null,
    verification_expires_at: null,
    verification_attempts: 0,
  }
}

/** L'empreinte d'un code, liée à la personne : la même suite de chiffres ne
 *  donne pas la même empreinte pour deux comptes. */
function hashCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex')
}

function sameDigest(stored: string, candidate: string): boolean {
  const a = Buffer.from(stored, 'hex')
  const b = Buffer.from(candidate, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Le texte d'une alerte : son titre, sur un seul segment. Le titre est déjà
 *  tenu de ne porter aucune donnée sensible (`notification-titles-no-sensitive-data.spec.ts`). */
function alertText(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim()
  return clean.length > SMS_MAX_LENGTH ? `${clean.slice(0, SMS_MAX_LENGTH - 1).trimEnd()}…` : clean
}

/** Le message d'une erreur de fournisseur, numéros masqués — un fournisseur
 *  cite volontiers le destinataire dans son erreur, et un journal ne doit
 *  jamais porter un numéro de téléphone. */
function withoutPhoneNumbers(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\+?\d[\d\s().-]{6,}\d/g, '[numéro masqué]')
}
