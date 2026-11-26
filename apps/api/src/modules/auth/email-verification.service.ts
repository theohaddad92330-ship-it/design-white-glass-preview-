import { Injectable } from '@nestjs/common'
import { OTP_CODE_EXPIRATION_MINUTES, type AuthOutcome, type SessionResponse } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import type { User } from '@supabase/supabase-js'
import { newEmailSenderWorker, type EmailSenderWorker } from '../mailer/email-sender.worker'
import { MailerQueue } from '../mailer/mailer.queue'
import { OtpService } from '../otp/otp.service'
import { SupabaseAuthGateway } from './supabase-auth.gateway'
import { SessionService } from './session.service'
import type { AuthFailure, AuthFailureCode } from './auth.types'

@Injectable()
export class EmailVerificationService {
  private readonly emailSenderWorker: EmailSenderWorker

  constructor(
    private readonly gateway: SupabaseAuthGateway,
    private readonly sessionService: SessionService,
    private readonly mailerQueue: MailerQueue,
    private readonly otpService: OtpService,
  ) {
    this.emailSenderWorker = newEmailSenderWorker(this.mailerQueue)
  }

  async signup(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<Result<AuthOutcome, AuthFailure>> {
    const existing = await this.gateway.findUserByEmail(email.toLowerCase())
    if (existing) {
      return this.handleExistingEmailSignup(existing, email)
    }

    const { data, error } = await this.gateway.client.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    })
    if (error || !data.user) {
      const code: AuthFailureCode = error?.message?.toLowerCase().includes('registered')
        ? 'email_taken'
        : 'signup_failed'
      return failure({ code, message: error?.message || 'Impossible de créer le compte' })
    }

    if (this.gateway.bypassEmailVerification) {
      await this.gateway.client.auth.admin.updateUserById(data.user.id, { email_confirm: true })
      await this.sendWelcomeEmail(email, firstName)
      const session: SessionResponse | null = data.session
        ? this.sessionService.mapToSessionResponse(data.session, data.user)
        : await this.signInAfterBypass(email, password)
      if (!session) {
        return success({ status: 'pending_email_verification', user_id: data.user.id, email })
      }
      return success({ status: 'authenticated', session })
    }

    // Welcome email waits until the email is verified (see verifyEmailOtp).
    const otpResult = await this.otpService.send(email.toLowerCase())
    if (otpResult.ok) {
      await this.emailSenderWorker.sendOtpEmail({
        to: email,
        firstName,
        otpCode: otpResult.value.code,
        expirationMinutes: OTP_CODE_EXPIRATION_MINUTES,
      })
    }
    // A throttled send is still a successful signup — the front lands on
    // /verify-email and can /resend once the cooldown expires.
    return success({ status: 'pending_email_verification', user_id: data.user.id, email })
  }

  // Confirmed → email_taken (log in instead). Unconfirmed → resume verification
  // so a user who abandoned signup can finish instead of hitting a dead end.
  private async handleExistingEmailSignup(user: User, email: string): Promise<Result<AuthOutcome, AuthFailure>> {
    if (user.email_confirmed_at) {
      return failure({ code: 'email_taken', message: 'Un compte existe déjà avec cet email.' })
    }
    await this.resendForUser(user)
    return success({ status: 'pending_email_verification', user_id: user.id, email })
  }

  // Sends a fresh OTP to an existing user. Public so AuthService.login can
  // resume verification for an unconfirmed email.
  async resendForUser(user: User): Promise<void> {
    if (this.gateway.bypassEmailVerification) return
    const email = user.email
    if (!email) return
    const sendResult = await this.otpService.send(email.toLowerCase())
    if (!sendResult.ok) return // throttled or other — front can /resend later

    const firstName = (user.user_metadata?.['first_name'] as string | undefined) ?? ''
    await this.emailSenderWorker.sendOtpEmail({
      to: email,
      firstName,
      otpCode: sendResult.value.code,
      expirationMinutes: OTP_CODE_EXPIRATION_MINUTES,
    })
  }

  private async signInAfterBypass(email: string, password: string): Promise<SessionResponse | null> {
    const reauth = await this.gateway.client.auth.signInWithPassword({ email, password })
    if (reauth.error || !reauth.data.session || !reauth.data.user) return null

    const sessionResponse: SessionResponse = this.sessionService.mapToSessionResponse(
      reauth.data.session,
      reauth.data.user,
    )
    return sessionResponse
  }

  // userId comes from the URL path; the email is resolved server-side so the
  // front never sends it.
  async verifyEmailOtp(userId: string, code: string): Promise<Result<SessionResponse, AuthFailure>> {
    const user = await this.gateway.findUserById(userId)
    if (!user || !user.email) {
      return failure({ code: 'user_not_found', message: 'Utilisateur introuvable' })
    }
    const normalizedEmail = user.email.toLowerCase()

    if (!this.gateway.bypassEmailVerification) {
      const verifyResult = await this.otpService.verify(normalizedEmail, code)
      if (!verifyResult.ok) {
        return failure({ code: verifyResult.code, message: otpFailureMessage(verifyResult.code) })
      }
    }

    const { error: updateError } = await this.gateway.client.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    })
    if (updateError) {
      return failure({ code: 'password_update_failed', message: updateError.message })
    }

    const firstName = (user.user_metadata?.['first_name'] as string | undefined) ?? ''
    await this.sendWelcomeEmail(user.email, firstName)

    return await this.exchangeForSession(normalizedEmail)
  }

  async resendEmailOtp(userId: string): Promise<Result<undefined, AuthFailure>> {
    if (this.gateway.bypassEmailVerification) return success()

    const user = await this.gateway.findUserById(userId)
    if (!user || !user.email) {
      return failure({ code: 'user_not_found', message: 'Utilisateur introuvable' })
    }
    const normalizedEmail = user.email.toLowerCase()

    const sendResult = await this.otpService.send(normalizedEmail)
    if (!sendResult.ok) {
      return failure({ code: sendResult.code, message: otpFailureMessage(sendResult.code) })
    }

    const firstName = (user.user_metadata?.['first_name'] as string | undefined) ?? ''
    await this.emailSenderWorker.sendOtpEmail({
      to: user.email,
      firstName,
      otpCode: sendResult.value.code,
      expirationMinutes: OTP_CODE_EXPIRATION_MINUTES,
    })
    return success()
  }

  private async exchangeForSession(email: string): Promise<Result<SessionResponse, AuthFailure>> {
    // No password stored server-side, so we issue a magic link via the admin
    // API and consume it immediately via verifyOtp.
    const { data: link, error: linkError } = await this.gateway.client.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkError || !link?.properties?.hashed_token) {
      return failure({ code: 'signup_failed', message: linkError?.message || 'Impossible de générer la session' })
    }

    const { data, error } = await this.gateway.client.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    })
    if (error || !data.session || !data.user) {
      return failure({ code: 'signup_failed', message: error?.message || 'Impossible de générer la session' })
    }

    const sessionResponse: SessionResponse = this.sessionService.mapToSessionResponse(data.session, data.user)
    return success(sessionResponse)
  }

  private async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const dashboardUrl: string = this.gateway.buildRedirectUrl('/dashboard')
    await this.emailSenderWorker.sendWelcomeEmail({
      to: email,
      firstName: firstName || email.split('@')[0] || 'there',
      dashboardUrl,
    })
  }
}

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
