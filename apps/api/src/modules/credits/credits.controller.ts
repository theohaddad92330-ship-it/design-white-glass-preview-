import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  Headers,
  ServiceUnavailableException,
  UseGuards,
  HttpCode,
  type RawBodyRequest,
} from '@nestjs/common'
import { SUPPORTED_CURRENCIES } from '@bellum/contracts'
import { Request } from 'express'
import Stripe from 'stripe'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { StripeService } from '../stripe/stripe.service'
import { CreditsService } from './credits.service'
import { CheckoutDto } from './dto/checkout.dto'

@Controller('credits')
export class CreditsController {
  private readonly logger = new Logger(CreditsController.name)

  constructor(
    private readonly creditsService: CreditsService,
    private readonly stripeService: StripeService,
  ) {}

  @Get()
  @UseGuards(JwtGuard)
  getCredits(@Req() req: Request) {
    const user = req.user as { userId: string }
    return this.creditsService.getCredits(user.userId)
  }

  @Get('invoices')
  @UseGuards(JwtGuard)
  getInvoices(@Req() req: Request) {
    const user = req.user as { userId: string }
    return this.creditsService.listInvoices(user.userId)
  }

  @Get('usage')
  @UseGuards(JwtGuard)
  getUsage(@Req() req: Request) {
    const user = req.user as { userId: string }
    return this.creditsService.getUsage(user.userId)
  }

  @Get('ledger')
  @UseGuards(JwtGuard)
  getLedger(@Req() req: Request) {
    const user = req.user as { userId: string }
    return this.creditsService.getLedger(user.userId)
  }

  @Post('checkout')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('billing:manage')
  async createCheckout(@Req() req: Request, @Body() dto: CheckoutDto) {
    const user = req.user as { userId: string; email: string }
    return this.creditsService.createCheckoutSession(user.userId, user.email, dto)
  }

  @Post('portal')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('billing:manage')
  async createPortal(@Req() req: Request) {
    const user = req.user as { userId: string }
    const { data } = await this.creditsService.getStripeCustomerId(user.userId)
    if (!data) {
      // Le portail Stripe a besoin d'un customer — il n'existe que si
      // l'utilisateur a déjà soit un abonnement, soit ajouté une carte
      // via `setup-payment-method`. Sinon on renvoie au client une URL
      // nulle pour que l'UI propose le flow d'ajout de carte.
      return { url: null, error: 'Aucun moyen de paiement enregistré' }
    }
    return this.creditsService.createPortalSession(data)
  }

  @Post('setup-payment-method')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('billing:manage')
  async setupPaymentMethod(@Req() req: Request) {
    const user = req.user as { userId: string; email: string }
    return this.creditsService.createSetupSession(user.userId, user.email)
  }

  @Get('plans')
  getPlans() {
    return this.creditsService.getPlanConfig()
  }

  /**
   * La devise dans laquelle CET espace sera facturé, et si elle est encore
   * choisissable.
   *
   * Un endpoint à part plutôt qu'un champ de plus sur `/credits/plans` : les
   * paliers sont publics et sans session, la devise dépend de l'espace. Les
   * mélanger obligerait à authentifier la grille tarifaire.
   */
  @Get('currency')
  @UseGuards(JwtGuard)
  getBillingCurrency(@Req() req: Request) {
    const user = (req as Request & { user: { userId: string } }).user
    return this.creditsService
      .resolveCheckoutCurrency(user.userId, null)
      .then(resolved => ({ ...resolved, supported: SUPPORTED_CURRENCIES }))
  }

  @Get('topup-packs')
  @UseGuards(JwtGuard)
  getTopupPacks() {
    return { packs: this.creditsService.getTopupPacks() }
  }

  @Post('topup')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  @RequirePermission('billing:manage')
  async createTopup(@Req() req: Request, @Body() dto: { pack_id: string }) {
    const user = req.user as { userId: string; email: string }
    return this.creditsService.createTopupCheckout(user.userId, user.email, dto?.pack_id ?? '')
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    // Fail-closed: Stripe is enabled on this service (the SDK requires STRIPE_SECRET_KEY)
    // but the webhook signing secret is missing, so we CANNOT authenticate the payload.
    // Never verify-with-empty-secret and never silently accept — reject (503) and log,
    // so Stripe retries once the secret is configured instead of us processing a spoofable event.
    if (!this.stripeService.isWebhookConfigured()) {
      this.logger.error('Stripe webhook secret is not configured — rejecting unverifiable webhook', {
        tags: { 'stripe.webhook': 'true', 'stripe.error': 'webhook_secret_missing' },
      })
      throw new ServiceUnavailableException('Stripe webhook is not configured')
    }

    let event: Stripe.Event

    try {
      event = this.stripeService.parseWebhookEvent(req.rawBody || Buffer.from(''), signature || '')
    } catch (err) {
      // The Winston → Sentry transport picks up `tags` from meta and forwards the error.
      // Respond 400 (NOT 200): a 200 makes Stripe treat an unverifiable-but-legitimate event
      // (e.g. after a secret rotation/misconfig) as delivered and NEVER retry → permanent loss.
      // 400 tells Stripe delivery failed so it retries. Never echo err.message — it can carry
      // signature/secret details; return a generic reason instead.
      this.logger.error('Stripe webhook signature verification failed', {
        error: err,
        tags: { 'stripe.webhook': 'true', 'stripe.error': 'signature_verification' },
      })
      throw new BadRequestException('Invalid Stripe webhook signature')
    }

    try {
      await this.creditsService.handleWebhookEvent(event)
    } catch (err) {
      this.logger.error('Stripe webhook handler failed', {
        error: err,
        tags: {
          'stripe.webhook': 'true',
          'stripe.event_type': event.type,
          'stripe.event_id': event.id,
        },
      })
      throw err
    }
    return { received: true }
  }
}
