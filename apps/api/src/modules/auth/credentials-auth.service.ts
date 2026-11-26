import { Injectable } from '@nestjs/common'
import { OTP_CODE_EXPIRATION_MINUTES, type AuthOutcome, type SessionResponse } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { newEmailSenderWorker, type EmailSenderWorker } from '../mailer/email-sender.worker'
import { MailerQueue } from '../mailer/mailer.queue'
import { OtpService } from '../otp/otp.service'
import { EmailVerificationService } from './email-verification.service'
import { MfaService } from './mfa.service'
import { SessionService } from './session.service'
import { SupabaseAuthGateway } from './supabase-auth.gateway'
import type { AuthFailure, AuthFailureCode } from './auth.types'

/**
 * Sign-in/sign-out + account lifecycle: password & passwordless sign-in,
 * logout, account deletion. Token refresh + session reads live in SessionService.
 */
@Injectable()
export class CredentialsAuthService {
  private readonly emailSenderWorker: EmailSenderWorker

  constructor(
    private readonly gateway: SupabaseAuthGateway,
    private readonly sessionService: SessionService,
    private readonly emailVerification: EmailVerificationService,
    private readonly mfa: MfaService,
    private readonly otpService: OtpService,
    mailerQueue: MailerQueue,
  ) {
    this.emailSenderWorker = newEmailSenderWorker(mailerQueue)
  }

  async login(email: string, password: string): Promise<Result<AuthOutcome, AuthFailure>> {
    const { data, error } = await this.gateway.client.auth.signInWithPassword({ email, password })

    // Unconfirmed email → resume verification (resend OTP, route to
    // /verify-email) rather than returning a 401 on valid credentials.
    if (error?.message && /email not confirmed|email_not_confirmed/i.test(error.message)) {
      const user = await this.gateway.findUserByEmail(email.toLowerCase())
      if (!user) {
        return failure({ code: 'invalid_credentials', message: 'Identifiants invalides' })
      }
      await this.emailVerification.resendForUser(user)
      return success({ status: 'pending_email_verification', user_id: user.id, email })
    }

    if (error || !data.session || !data.user) {
      return failure({ code: 'invalid_credentials', message: error?.message || 'Identifiants invalides' })
    }

    // Password OK — but if the account has an active TOTP factor, DON'T issue a
    // session yet. Hand back a short-lived challenge token; the front collects a
    // code and finishes via POST /auth/2fa/challenge. Accounts WITHOUT 2FA fall
    // straight through to the exact same mapped session + shape as before.
    if (await this.mfa.isEnabled(data.user.id)) {
      const mfaToken = await this.mfa.issueMfaToken(data.user.id)
      return success({ status: 'mfa_required', mfaRequired: true, mfaToken })
    }

    const session: SessionResponse = this.sessionService.mapToSessionResponse(data.session, data.user)
    return success({ status: 'authenticated', session })
  }

  /**
   * Premier temps de la connexion sans mot de passe : envoyer un CODE.
   *
   * Il déléguait à `supabase.auth.signInWithOtp`, dont le gabarit d'e-mail est
   * le « Magic Link » : le destinataire recevait un LIEN pendant que l'écran lui
   * demandait six caractères. Les deux étaient cohérents chacun de leur côté et
   * contradictoires ensemble — le genre de défaut qu'on ne voit qu'en regardant
   * la boîte de réception d'un vrai utilisateur (retour Laura, 14/08).
   *
   * On réutilise donc {@link OtpService} et notre propre gabarit, exactement
   * comme la vérification d'inscription : même alphabet, même durée de vie,
   * même limitation d'envoi. Aucun gabarit hébergé chez un tiers ne peut plus
   * décider de ce que reçoit l'utilisateur.
   *
   * Réussite systématique côté réponse, y compris pour une adresse inconnue :
   * répondre autrement révélerait quels comptes existent. Un envoi limité par le
   * throttle est également un succès — le front propose de renvoyer après le
   * délai.
   */
  async requestOtp(email: string): Promise<Result<undefined, AuthFailure>> {
    const normalized = email.trim().toLowerCase()
    const user = await this.gateway.findUserByEmail(normalized)
    if (!user) return success()

    const sent = await this.otpService.send(normalized)
    if (!sent.ok) return success()

    const firstName = (user.user_metadata?.['first_name'] as string | undefined) ?? ''
    await this.emailSenderWorker.sendOtpEmail({
      to: user.email ?? normalized,
      firstName,
      otpCode: sent.value.code,
      expirationMinutes: OTP_CODE_EXPIRATION_MINUTES,
    })
    return success()
  }

  /**
   * Second temps : échanger l'e-mail et le code de {@link requestOtp} contre une
   * vraie session, posée exactement comme une connexion par mot de passe (même
   * cookie via l'intercepteur, même forme d'`AuthOutcome`).
   *
   * Deux garanties conservées du chemin précédent :
   *  - un code faux, expiré ou une adresse inconnue rendent la même issue, pour
   *    que cet écran ne devienne pas un test d'existence de comptes ;
   *  - un compte avec 2FA n'obtient PAS de session ici. Le code par e-mail
   *    prouve l'accès à la boîte, pas la possession du second facteur : le
   *    contourner viderait la 2FA de son sens.
   */
  async verifyOtp(email: string, code: string): Promise<Result<AuthOutcome, AuthFailure>> {
    const normalized = email.trim().toLowerCase()
    const user = await this.gateway.findUserByEmail(normalized)
    // Adresse inconnue : même issue qu'un mauvais code. Distinguer les deux
    // transformerait cet écran en test d'existence de comptes.
    if (!user) {
      return failure({ code: 'otp_invalid', message: 'Code invalide ou expiré.' })
    }

    const verified = await this.otpService.verify(normalized, code)
    if (!verified.ok) {
      return failure({ code: verified.code, message: otpFailureMessage(verified.code) })
    }

    if (await this.mfa.isEnabled(user.id)) {
      // Aucune session n'a encore été frappée : rien à révoquer, contrairement au
      // chemin Supabase d'avant. Le navigateur n'en obtiendra qu'après le TOTP.
      const mfaToken = await this.mfa.issueMfaToken(user.id)
      return success({ status: 'mfa_required', mfaRequired: true, mfaToken })
    }

    // Le code prouve l'accès à la boîte, pas le mot de passe — qu'on ne détient
    // pas. On frappe donc la session par lien à usage unique consommé sur-le-champ,
    // le même mécanisme que la vérification d'e-mail à l'inscription.
    const { data: link, error: linkError } = await this.gateway.client.auth.admin.generateLink({
      type: 'magiclink',
      email: normalized,
    })
    if (linkError || !link?.properties?.hashed_token) {
      return failure({ code: 'otp_failed', message: 'Impossible d’ouvrir la session. Réessayez.' })
    }

    const { data, error } = await this.gateway.client.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    })
    if (error || !data.session || !data.user) {
      return failure({ code: 'otp_failed', message: 'Impossible d’ouvrir la session. Réessayez.' })
    }

    const session: SessionResponse = this.sessionService.mapToSessionResponse(data.session, data.user)
    return success({ status: 'authenticated', session })
  }

  async logout(accessToken: string): Promise<Result<undefined, AuthFailure>> {
    if (!accessToken) {
      // No cookie present — already logged out from this device's POV.
      return success()
    }
    const { error } = await this.gateway.client.auth.admin.signOut(accessToken)
    if (error) {
      return failure({ code: 'logout_failed', message: error.message })
    }
    return success()
  }

  async deleteAccount(userId: string): Promise<Result<undefined, AuthFailure>> {
    const { error } = await this.gateway.client.auth.admin.deleteUser(userId)
    if (error) {
      return failure({ code: 'delete_failed', message: error.message })
    }
    return success()
  }
}

/** Les quatre issues d'un code, dites en français. Mêmes textes que la
 *  vérification d'inscription : c'est le même code, l'utilisateur ne doit pas
 *  découvrir deux vocabulaires pour une seule mécanique. */
type OtpFailureCode = Extract<AuthFailureCode, 'otp_invalid' | 'otp_expired' | 'otp_throttled' | 'otp_max_attempts'>

function otpFailureMessage(code: OtpFailureCode): string {
  switch (code) {
    case 'otp_invalid':
      return 'Code invalide. Vérifiez les 6 caractères et réessayez.'
    case 'otp_expired':
      return 'Code expiré. Demandez un nouvel envoi.'
    case 'otp_throttled':
      return 'Un code vient d’être envoyé. Patientez avant d’en redemander un.'
    case 'otp_max_attempts':
      return 'Trop de tentatives. Demandez un nouveau code.'
  }
}
