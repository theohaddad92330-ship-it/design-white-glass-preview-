import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'

type CheckoutLineItemPlan = {
  name: string
  description: string
  unitAmount: number
  currency?: string
  /** Recurring billing interval. Defaults to monthly when omitted. */
  interval?: 'month' | 'year'
  /** Stamped on the inline product — lets a later re-pricing identify this line. */
  productMetadata?: Record<string, string>
}

/** Optional per-seat add-on line item (billed alongside the plan). */
type CheckoutSeatAddon = {
  name: string
  description: string
  /** Price per seat, in cents (server-authoritative). */
  unitAmount: number
  /** Number of extra seats — the Stripe line-item quantity. */
  quantity: number
  interval?: 'month' | 'year'
  currency?: string
  /** Stamped on the inline product — lets a later re-pricing skip this line. */
  productMetadata?: Record<string, string>
}

type CreateSubscriptionCheckoutInput = {
  customerEmail: string
  metadata: Record<string, string>
  successUrl: string
  cancelUrl: string
  plan: CheckoutLineItemPlan
  /** When set (quantity > 0), a second recurring line item for extra seats. */
  seatAddon?: CheckoutSeatAddon
}

/** Une ligne d'abonnement existante, aplatie pour le caller. */
export type SubscriptionLineItem = {
  itemId: string
  /** Montant unitaire en centimes, `null` sur un prix Stripe sans montant fixe. */
  unitAmount: number | null
  currency: string
  /** Cadence RÉELLE de la ligne — à préserver lors d'un changement de tarif. */
  interval: 'month' | 'year'
  quantity: number
  /** Produit Stripe porté par la ligne — réutilisé tel quel lors d'un re-tarifage. */
  productId: string
  /** Nom du produit, `''` si le produit a été supprimé côté Stripe. */
  productName: string
  productMetadata: Record<string, string>
}

type UpdateSubscriptionItemPriceInput = {
  subscriptionId: string
  /** Ligne à re-tarifer (`SubscriptionLineItem.itemId`). */
  itemId: string
  /** Produit existant auquel rattacher le nouveau prix. */
  productId: string
  /** Nouveau montant unitaire en centimes (server-authoritative). */
  unitAmount: number
  interval: 'month' | 'year'
  /** Préserver la quantité existante — Stripe la remet à 1 si on l'omet. */
  quantity: number
  currency?: string
}

type CreateSetupCheckoutInput = {
  customerId: string
  successUrl: string
  cancelUrl: string
}

type CreateOneShotCheckoutInput = {
  customerEmail: string
  name: string
  description: string
  /** Prix total du pack en centimes (server-authoritative). */
  unitAmount: number
  currency?: string
  metadata: Record<string, string>
  successUrl: string
  cancelUrl: string
}

/**
 * Gateway de bas niveau autour du SDK Stripe.
 *
 * Tout le code qui parle à Stripe transite par ce service. Les
 * `*Service` métiers (`CreditsService`, etc.) injectent
 * `StripeService` au lieu d'instancier `new Stripe(...)` eux-mêmes —
 * ça centralise :
 *   - l'init du SDK (clé secrète, version d'API)
 *   - le typage des inputs (on n'expose pas la shape brute Stripe aux callers)
 *   - la vérification de signature des webhooks
 *
 * Ne pas mettre de logique BellumAI ici. Si tu te retrouves à lire la
 * table `user_credits` dans une méthode, c'est qu'elle ne devrait pas
 * vivre ici — déplace-la dans le service métier.
 */
@Injectable()
export class StripeService {
  private readonly stripe: Stripe
  private readonly webhookSecret: string
  private readonly logger = new Logger(StripeService.name)

  constructor(config: ConfigService) {
    const key = config.get<string>('stripeSecretKey', '')
    if (!key) throw new Error('STRIPE_SECRET_KEY is required but not set')
    this.stripe = new Stripe(key, {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    })
    this.webhookSecret = config.get<string>('stripeWebhookSecret', '')
  }

  /** Crée un Customer Stripe — `metadata` doit porter `userId` BellumAI. */
  async createCustomer(input: { email: string; metadata: Record<string, string> }): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      email: input.email,
      metadata: input.metadata,
    })
  }

  /** Checkout en mode `subscription` — débit récurrent à la carte renseignée. */
  async createSubscriptionCheckout(input: CreateSubscriptionCheckoutInput): Promise<Stripe.Checkout.Session> {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: input.plan.currency ?? 'eur',
          unit_amount: input.plan.unitAmount,
          recurring: { interval: input.plan.interval ?? 'month' },
          product_data: {
            name: input.plan.name,
            description: input.plan.description,
            ...(input.plan.productMetadata && { metadata: input.plan.productMetadata }),
          },
        },
        quantity: 1,
      },
    ]

    if (input.seatAddon && input.seatAddon.quantity > 0) {
      const seat = input.seatAddon
      lineItems.push({
        price_data: {
          currency: seat.currency ?? 'eur',
          unit_amount: seat.unitAmount,
          recurring: { interval: seat.interval ?? 'month' },
          product_data: {
            name: seat.name,
            description: seat.description,
            ...(seat.productMetadata && { metadata: seat.productMetadata }),
          },
        },
        quantity: seat.quantity,
      })
    }

    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: input.customerEmail,
      line_items: lineItems,
      metadata: input.metadata,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    })
  }

  /**
   * Checkout en mode `payment` — débit unique (one-shot), pas d'abonnement.
   * Sert aux recharges de crédits (top-up) : le prix est celui du pack côté
   * serveur, jamais une valeur envoyée par le client. `metadata` porte
   * `userId` + `topupPackId` pour que le webhook crédite le bon pool.
   */
  async createOneShotCheckout(input: CreateOneShotCheckoutInput): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: input.customerEmail,
      line_items: [
        {
          price_data: {
            currency: input.currency ?? 'eur',
            unit_amount: input.unitAmount,
            product_data: {
              name: input.name,
              description: input.description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: input.metadata,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    })
  }

  /** Checkout en mode `setup` — collecte une carte sans débit. */
  async createSetupCheckout(input: CreateSetupCheckoutInput): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      mode: 'setup',
      customer: input.customerId,
      payment_method_types: ['card'],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    })
  }

  /**
   * Annule immédiatement un abonnement (droit à l'effacement RGPD — on coupe la
   * facturation récurrente quand l'utilisateur supprime son compte). `cancel()`
   * résilie tout de suite SANS proratisation ni facture supplémentaire : aucun
   * débit n'est déclenché. Idempotent côté Stripe si déjà annulé (renvoie l'objet
   * dans l'état `canceled`).
   */
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.cancel(subscriptionId)
  }

  /**
   * Liste les lignes d'un abonnement existant, aplaties (pas de shape Stripe
   * brute exposée au caller). `product.metadata` est développé pour que le
   * caller puisse identifier la ligne « plan » via son tag, sans matcher sur un
   * nom d'affichage.
   *
   * Un produit supprimé côté Stripe (`deleted: true`) n'expose ni nom ni
   * metadata — la ligne est renvoyée avec des valeurs vides plutôt qu'ignorée,
   * pour que le caller décide (et loggue) au lieu de la rater silencieusement.
   */
  async listSubscriptionItems(subscriptionId: string): Promise<SubscriptionLineItem[]> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    })
    return sub.items.data.map(item => {
      const product = item.price.product
      const resolved = typeof product === 'object' && !product.deleted ? product : undefined
      return {
        itemId: item.id,
        unitAmount: item.price.unit_amount,
        currency: item.price.currency,
        interval: item.price.recurring?.interval === 'year' ? 'year' : 'month',
        quantity: item.quantity ?? 1,
        productId: typeof product === 'string' ? product : product.id,
        productName: resolved?.name ?? '',
        productMetadata: resolved?.metadata ?? {},
      }
    })
  }

  /**
   * Met à jour le nom / les metadata d'un produit Stripe existant. Chaque
   * checkout crée un produit inline dédié à son abonnement — le renommer ne
   * touche donc qu'un seul client, jamais un catalogue partagé.
   */
  async updateProduct(productId: string, patch: { name?: string; metadata?: Record<string, string> }): Promise<void> {
    await this.stripe.products.update(productId, patch)
  }

  /**
   * Remplace le prix d'UNE ligne d'abonnement existante par un nouveau montant.
   * Le nouveau prix est rattaché au produit que la ligne porte DÉJÀ : Stripe
   * exige un `product` existant ici (pas de `product_data` inline comme au
   * checkout), et le réutiliser évite d'accumuler un produit jetable par
   * changement de tarif.
   *
   * `proration_behavior: 'none'` est le cœur du contrat : Stripe n'émet AUCUNE
   * facture ni avoir immédiat. Le client termine le cycle déjà payé au tarif
   * précédent et n'est facturé au nouveau tarif qu'à son prochain
   * renouvellement. Une erreur de saisie corrigée avant cette date ne coûte donc
   * rien à personne.
   *
   * `metadata` de l'abonnement volontairement NON touchée : le webhook
   * `customer.subscription.updated` ne réagit que si `metadata.plan` est présent,
   * et sa branche recharge à plein les crédits d'enrichissement. Un simple
   * changement de tarif ne modifie aucun quota — on laisse donc l'event arriver
   * sans `plan` et être ignoré, sinon on rechargerait les crédits de tous les
   * abonnés en milieu de cycle.
   */
  async updateSubscriptionItemPrice(input: UpdateSubscriptionItemPriceInput): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(input.subscriptionId, {
      items: [
        {
          id: input.itemId,
          quantity: input.quantity,
          price_data: {
            currency: input.currency ?? 'eur',
            unit_amount: input.unitAmount,
            recurring: { interval: input.interval },
            product: input.productId,
          },
        },
      ],
      proration_behavior: 'none',
    })
  }

  /** Ouvre le portail de facturation Stripe pour un customer existant. */
  async createBillingPortal(input: { customerId: string; returnUrl: string }): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    })
  }

  /**
   * Liste les factures Stripe d'un customer, les plus récentes d'abord.
   * `limit` est plafonné à 100 par Stripe — on reste bien en-deçà. Le
   * service métier mappe les champs bruts vers une shape UI et gère
   * l'absence de customer / les erreurs réseau.
   */
  async listInvoices(customerId: string, limit = 12): Promise<Stripe.Invoice[]> {
    const res = await this.stripe.invoices.list({ customer: customerId, limit })
    return res.data
  }

  /**
   * Indique si la vérification de signature des webhooks est configurée
   * (`STRIPE_WEBHOOK_SECRET` présent). Le caller DOIT s'en servir pour
   * fail-closed : sans secret, un webhook arrivant ne peut pas être
   * authentifié et ne doit surtout pas être traité (cf. controller).
   */
  isWebhookConfigured(): boolean {
    return this.webhookSecret.length > 0
  }

  /**
   * Vérifie la signature d'un webhook Stripe et retourne l'événement
   * parsé. Lance une exception si la signature est invalide — le caller
   * doit logger et renvoyer 400.
   */
  parseWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET missing — webhook signature cannot be verified')
    }
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret)
  }
}
