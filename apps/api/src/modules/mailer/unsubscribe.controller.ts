import { Controller, Get, Header, HttpCode, Post, Query } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SuppressionService } from './suppression.service'
import { verifyUnsubscribeToken } from './unsubscribe-token'

/**
 * Public (unauthenticated) unsubscribe endpoint linked from every outreach
 * email — the signed token IS the authorisation. Deliberately NOT behind the
 * InternalSecretGuard that protects /emails/test (a prospect must be able to
 * opt out without any Bellum credential).
 *
 * - GET  /emails/unsubscribe?token=…  → human clicks the footer link → confirms + suppresses
 * - POST /emails/unsubscribe?token=…  → RFC 8058 one-click (List-Unsubscribe-Post)
 */
@Controller('emails')
export class UnsubscribeController {
  constructor(
    private readonly suppression: SuppressionService,
    private readonly config: ConfigService,
  ) {}

  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribeGet(@Query('token') token?: string): Promise<string> {
    const ok = await this.applyUnsubscribe(token)
    return renderUnsubscribePage(ok)
  }

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribePost(@Query('token') token?: string): Promise<{ ok: boolean }> {
    const ok = await this.applyUnsubscribe(token)
    return { ok }
  }

  private async applyUnsubscribe(token?: string): Promise<boolean> {
    const secret = this.config.get<string>('internalApiSecret') ?? ''
    const claims = token && secret ? verifyUnsubscribeToken(token, secret) : null
    if (!claims) return false
    await this.suppression.suppress(claims.workspaceId, claims.email, 'unsubscribe')
    return true
  }
}

function renderUnsubscribePage(ok: boolean): string {
  const title = ok ? 'Désabonnement confirmé' : 'Lien invalide'
  const message = ok
    ? 'Vous ne recevrez plus d’emails de prospection de cet expéditeur.'
    : 'Ce lien de désabonnement est invalide ou expiré.'
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#111;margin:0;padding:48px 16px"><div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center"><h1 style="font-size:18px;margin:0 0 12px">${title}</h1><p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0">${message}</p></div></body></html>`
}
