import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { SessionResponse } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { RESET_LINK_TTL_MS, buildResetLink, resetSignatureIsValid } from './reset-link'
import { newEmailSenderWorker, type EmailSenderWorker } from '../mailer/email-sender.worker'
import { MailerQueue } from '../mailer/mailer.queue'
import { SupabaseAuthGateway } from './supabase-auth.gateway'
import { SessionService } from './session.service'
import type { AuthFailure, AuthFailureCode } from './auth.types'

type ResetTokenProof = {
  expiresAt: number
  signature: string
}

/**
 * Ce que Supabase répond quand l'adresse n'a simplement pas de compte.
 *
 * C'est le SEUL échec normal de `generateLink` : tout le reste est une panne
 * (clé de service invalide, URL de redirection non autorisée, limite de débit)
 * et doit se voir.
 */
function isUnknownUser(message: string): boolean {
  const lowered = message.toLowerCase()
  return lowered.includes('user not found') || lowered.includes('user_not_found')
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name)
  private readonly emailSenderWorker: EmailSenderWorker

  constructor(
    private readonly gateway: SupabaseAuthGateway,
    private readonly sessionService: SessionService,
    private readonly mailerQueue: MailerQueue,
    private readonly config: ConfigService,
  ) {
    this.emailSenderWorker = newEmailSenderWorker(this.mailerQueue)
  }

  async resetPassword(email: string): Promise<Result<undefined, AuthFailure>> {
    const redirectTo = this.gateway.buildRedirectUrl('/auth/reset-password')
    // `generateLink` yields a `hashed_token` the front consumes via `verifyOtp`
    // server-side — single email path, full control over the template.
    //
    // SECURITY: never leak whether the email is registered (account
    // enumeration). Both branches return the same `success()`; only the
    // side-effect (mailer call) differs, which is invisible to the caller.
    const { data, error } = await this.gateway.client.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })
    const tokenHash: string | undefined = !error ? data?.properties?.hashed_token : undefined

    // Le silence anti-énumération protège l'APPELANT, jamais l'exploitant.
    //
    // Le défaut trouvé en production le 20/08 : un utilisateur cliquait
    // « mot de passe oublié », l'écran affichait « email envoyé », et rien ne
    // partait — sans une ligne nulle part. Un échec de génération de lien ne
    // laissait aucune trace, donc aucun diagnostic n'était possible : ni dans
    // les journaux, ni dans Sentry, ni en relisant le code.
    //
    // Un compte inexistant reste normal et silencieux. Tout autre échec est
    // une panne et part en `logger.error` — donc dans Sentry, donc sur un
    // écran que quelqu'un regarde. L'adresse n'est jamais journalisée en
    // clair : son domaine suffit à reconnaître le cas sans exposer la personne.
    if (error) {
      const message = error.message || 'unknown error'
      const domain = email.split('@')[1] ?? 'unknown'
      if (isUnknownUser(message)) {
        this.logger.log(`Password reset asked for an unknown account (@${domain}) — nothing sent, by design`)
      } else {
        this.logger.error('Password reset link generation failed — no email will be sent', {
          error,
          tags: { 'auth.op': 'reset_password', 'auth.email_domain': domain },
        })
      }
      return success()
    }

    if (!tokenHash) {
      // Supabase a répondu sans erreur ET sans jeton. Rien à envoyer, et rien
      // n'explique pourquoi : c'est exactement le cas qu'il faut voir passer.
      this.logger.error('Password reset link generation returned no token — no email will be sent', {
        tags: { 'auth.op': 'reset_password', 'auth.email_domain': email.split('@')[1] ?? 'unknown' },
      })
      return success()
    }

    {
      const expiresAt = Date.now() + RESET_LINK_TTL_MS
      // Construction PARTAGÉE avec le back-office : les deux chemins doivent
      // mener au même écran, sinon l'un des deux remet un lien qui ne permet
      // pas de changer son mot de passe.
      const resetUrl = buildResetLink({
        frontendUrl: this.config.get<string>('frontendUrl', ''),
        tokenHash,
        expiresAt,
        secret: this.config.getOrThrow<string>('supabaseJwtSecret'),
      })
      const meta = data?.user?.user_metadata ?? {}
      // Prefer explicit first_name (password signups since ENG-145), fall back
      // on full_name first segment (legacy + OAuth providers).
      const firstNameMeta = (meta['first_name'] as string | undefined) ?? ''
      const fullNameMeta = (meta['full_name'] as string | undefined) ?? ''
      const firstName = firstNameMeta || fullNameMeta.split(' ')[0] || email.split('@')[0] || 'there'
      try {
        await this.emailSenderWorker.sendResetPasswordEmail({ to: email, firstName, resetUrl })
      } catch (queueError) {
        // Mettre en file peut échouer (Redis indisponible). Le taire rendrait
        // l'écran menteur une seconde fois, au même endroit.
        this.logger.error('Password reset email could not be queued', {
          error: queueError,
          tags: { 'auth.op': 'reset_password', 'auth.email_domain': email.split('@')[1] ?? 'unknown' },
        })
      }
    }
    return success()
  }

  async confirmResetPassword(
    tokenHash: string,
    password: string,
    proof: ResetTokenProof,
  ): Promise<Result<SessionResponse, AuthFailure>> {
    const proofFailure = this.validateResetTokenProof(tokenHash, proof)
    if (proofFailure) return failure(proofFailure)

    // Single-use recovery token; a replay surfaces as reset_token_invalid.
    const { data, error } = await this.gateway.client.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    })
    if (error || !data.user || !data.session) {
      const msg = (error?.message || '').toLowerCase()
      const code: AuthFailureCode = msg.includes('expired') ? 'reset_token_expired' : 'reset_token_invalid'
      return failure({ code, message: error?.message || 'Lien de réinitialisation invalide' })
    }

    const { error: updateError } = await this.gateway.client.auth.admin.updateUserById(data.user.id, { password })
    if (updateError) {
      return failure({
        code: 'password_update_failed',
        message: updateError.message || 'Impossible de mettre à jour le mot de passe',
      })
    }

    // Keep the verifyOtp session so the user lands straight on the dashboard.
    const sessionResult = this.sessionService.mapToSessionResponse(data.session, data.user)
    return success(sessionResult)
  }

  private validateResetTokenProof(tokenHash: string, proof: ResetTokenProof): AuthFailure | null {
    if (Date.now() > proof.expiresAt) {
      return { code: 'reset_token_expired', message: 'Lien de réinitialisation expiré' }
    }

    const valid = resetSignatureIsValid(
      tokenHash,
      proof.expiresAt,
      proof.signature,
      this.config.getOrThrow<string>('supabaseJwtSecret'),
    )
    return valid ? null : { code: 'reset_token_invalid', message: 'Signature du lien invalide' }
  }
}
