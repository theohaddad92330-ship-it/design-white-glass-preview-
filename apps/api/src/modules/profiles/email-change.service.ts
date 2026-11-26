import { Inject, Injectable } from '@nestjs/common'
import { OTP_CODE_EXPIRATION_MINUTES, type EmailChangeRequested, type UserProfile } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import type Redis from 'ioredis'
import { SupabaseAuthGateway } from '../auth/supabase-auth.gateway'
import { newEmailSenderWorker, type EmailSenderWorker } from '../mailer/email-sender.worker'
import { MailerQueue } from '../mailer/mailer.queue'
import { OTP_REDIS_TOKEN } from '../otp/otp-redis.token'
import { OtpService } from '../otp/otp.service'
import { ProfilesService } from './profiles.service'

const PENDING_TTL_SECONDS = OTP_CODE_EXPIRATION_MINUTES * 60

type EmailChangeFailureCode =
  | 'email_unchanged' //  the new address equals the current one — no-op
  | 'email_taken' //     another user already owns the address
  | 'otp_invalid' //     OTP didn't match
  | 'otp_expired' //     no OTP in Redis (TTL elapsed)
  | 'otp_throttled' //   a code was just sent — wait before re-requesting
  | 'otp_max_attempts' //too many failed verify calls
  | 'update_failed' //   Supabase auth or profile row write failed

export type EmailChangeFailure = {
  code: EmailChangeFailureCode
  message: string
  cause?: unknown
}

/**
 * Two-step email change: the user requests a new address, the OTP is sent to
 * that new address, and the change is only applied once they read the code
 * and confirm. The OTP key is scoped to `change:{userId}:{newEmail}` so an
 * attacker who guesses a code can't claim somebody else's pending change.
 */
@Injectable()
export class EmailChangeService {
  private readonly emailSenderWorker: EmailSenderWorker

  constructor(
    private readonly gateway: SupabaseAuthGateway,
    private readonly otpService: OtpService,
    private readonly profiles: ProfilesService,
    @Inject(OTP_REDIS_TOKEN) private readonly redis: Redis,
    mailerQueue: MailerQueue,
  ) {
    this.emailSenderWorker = newEmailSenderWorker(mailerQueue)
  }

  async request(userId: string, newEmailRaw: string): Promise<Result<EmailChangeRequested, EmailChangeFailure>> {
    const newEmail = newEmailRaw.trim().toLowerCase()

    const currentUser = await this.gateway.findUserById(userId)
    if (currentUser?.email?.toLowerCase() === newEmail) {
      return failure({ code: 'email_unchanged', message: 'Cette adresse est déjà la vôtre.' })
    }
    const owner = await this.gateway.findUserByEmail(newEmail)
    if (owner && owner.id !== userId) {
      return failure({ code: 'email_taken', message: 'Cette adresse est déjà utilisée par un autre compte.' })
    }

    const sendResult = await this.otpService.send(this.otpKey(userId, newEmail))
    if (!sendResult.ok) {
      return failure({ code: sendResult.code, message: otpFailureMessage(sendResult.code) })
    }

    // Mirror the pending target email so a page reload can find it again
    // and force the user to finish (or wait out) the verification flow.
    await this.redis.set(this.pendingKey(userId), newEmail, 'EX', PENDING_TTL_SECONDS)

    const firstName = (currentUser?.user_metadata?.['first_name'] as string | undefined) ?? ''
    await this.emailSenderWorker.sendOtpEmail({
      to: newEmail,
      firstName,
      otpCode: sendResult.value.code,
      expirationMinutes: OTP_CODE_EXPIRATION_MINUTES,
    })

    const response: EmailChangeRequested = { status: 'otp_sent', new_email: newEmail }
    return success(response)
  }

  async confirm(userId: string, newEmailRaw: string, code: string): Promise<Result<UserProfile, EmailChangeFailure>> {
    const newEmail = newEmailRaw.trim().toLowerCase()

    const verifyResult = await this.otpService.verify(this.otpKey(userId, newEmail), code)
    if (!verifyResult.ok) {
      return failure({ code: verifyResult.code, message: otpFailureMessage(verifyResult.code) })
    }

    const { error } = await this.gateway.client.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    })
    if (error) {
      return failure({ code: 'update_failed', message: error.message, cause: error })
    }

    const upserted = await this.profiles.upsertMe(userId, { email: newEmail })
    if (upserted.type === 'failure') {
      return failure({ code: 'update_failed', message: upserted.problem.message, cause: upserted.problem.cause })
    }

    // Mirror cleared — the change is committed, no need to resume.
    await this.redis.del(this.pendingKey(userId))

    const entity = upserted.output
    const profile: UserProfile = {
      id: entity.id,
      user_id: entity.user_id,
      email: entity.email,
      first_name: entity.first_name,
      last_name: entity.last_name,
      avatar_url: entity.avatar_url,
      // Le fuseau voyage ici aussi : c'est la SECONDE surface qui rend un
      // profil complet (celle-là après un changement d'e-mail confirmé). Un
      // champ posé sur une seule des deux aurait fait « disparaître » le fuseau
      // de l'écran juste après la confirmation du code — une famille câblée à
      // moitié, et chaque moitié a son test qui passe.
      timezone: entity.timezone ?? null,
      created_at: entity.created_at.toISOString(),
      updated_at: entity.updated_at.toISOString(),
      auth_created_at: null,
      auth_last_sign_in_at: null,
    }
    return success(profile)
  }

  /** Returns the new email of an in-flight change request, or `null`. */
  async getPending(userId: string): Promise<string | null> {
    const value = await this.redis.get(this.pendingKey(userId))
    return value
  }

  private otpKey(userId: string, newEmail: string): string {
    return `change:${userId}:${newEmail}`
  }

  private pendingKey(userId: string): string {
    return `email-change:pending:${userId}`
  }
}

function otpFailureMessage(code: 'otp_invalid' | 'otp_expired' | 'otp_throttled' | 'otp_max_attempts'): string {
  switch (code) {
    case 'otp_invalid':
      return 'Code invalide. Vérifiez les caractères et réessayez.'
    case 'otp_expired':
      return 'Code expiré. Demandez un nouvel envoi.'
    case 'otp_throttled':
      return "Un code vient d'être envoyé. Patientez avant d'en redemander un."
    case 'otp_max_attempts':
      return 'Trop de tentatives. Demandez un nouveau code.'
  }
}
