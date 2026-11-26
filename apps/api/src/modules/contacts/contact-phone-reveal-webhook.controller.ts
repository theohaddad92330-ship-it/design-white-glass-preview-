import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common'
import { ContactPhoneRevealService, PHONE_REVEAL_WEBHOOK_PATH } from './contact-phone-reveal.service'
import { PhoneRevealWebhookGuard, type PhoneRevealRequest } from './phone-reveal-webhook.guard'

/**
 * E1 (07/10/2026, #3698 — décision Louis) — Apollo livre ici le mobile demandé
 * par `ContactPhoneRevealService.request`. Public, gardé par le jeton signé du
 * chemin (`PhoneRevealWebhookGuard`). Répond toujours 200 `{ received: true }`
 * à une livraison authentifiée, acceptée ou non (nonce périmé, rejouée) : rien
 * ne renseigne l'appelant sur l'état de la fiche.
 */
@Controller(PHONE_REVEAL_WEBHOOK_PATH)
@UseGuards(PhoneRevealWebhookGuard)
export class ContactPhoneRevealWebhookController {
  constructor(private readonly reveal: ContactPhoneRevealService) {}

  @Post(':token')
  @HttpCode(200)
  async receive(@Req() request: PhoneRevealRequest, @Body() body: unknown): Promise<{ received: true }> {
    const target = request.phoneReveal
    if (target) await this.reveal.applyWebhook(target, body)
    return { received: true }
  }
}
