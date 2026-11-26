import { useCallback } from 'react'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { useCheckout, usePortal, useSetupPaymentMethod } from './useCheckout'

type StripeRedirectAction<TInput> = {
  /** État `pending` exposé par la mutation TanStack — bind à un loader UI. */
  pending: boolean
  /** Lance la mutation, redirige sur l'URL Stripe ou affiche un toast en cas d'erreur. */
  redirect: TInput extends void ? () => Promise<void> : (input: TInput) => Promise<void>
}

type RedirectMessages = {
  /** Clé i18n du toast affiché si la réponse n'a pas d'URL (cas dégradé côté serveur). */
  missingUrl: string
  /** Clé i18n du toast affiché si la mutation throw — typiquement réseau ou 500. */
  failed: string
}

// Clés i18n (résolues via i18n.t au moment du toast, pas à l'import — la
// langue courante est donc toujours respectée).
const CHECKOUT_MESSAGES: RedirectMessages = {
  missingUrl: 'billing:toast.checkoutMissingUrl',
  failed: 'billing:toast.paymentConnectionError',
}

const PORTAL_MESSAGES: RedirectMessages = {
  missingUrl: 'billing:toast.portalMissingUrl',
  failed: 'billing:toast.portalConnectionError',
}

const SETUP_MESSAGES: RedirectMessages = {
  missingUrl: 'billing:toast.paymentSetupMissingUrl',
  failed: 'billing:toast.stripeInitError',
}

/**
 * Helper bas-niveau partagé par les 3 hooks de redirection ci-dessous.
 * Encapsule le pattern :
 *   1. lance la mutation
 *   2. si `url` présente → `window.location.href = url`
 *   3. sinon → toast d'erreur lisible
 *   4. catch → log + toast générique
 *
 * `console.error` est volontaire (pas un `throw`) — l'utilisateur voit un
 * toast et reste sur la page, le détail technique part dans Sentry via
 * la console capture.
 */
function makeRedirect<TInput>(
  mutate: TInput extends void
    ? () => Promise<{ url?: string | null }>
    : (input: TInput) => Promise<{ url?: string | null }>,
  messages: RedirectMessages,
): TInput extends void ? () => Promise<void> : (input: TInput) => Promise<void> {
  return (async (input?: TInput) => {
    try {
      const res =
        input === undefined
          ? await (mutate as () => Promise<{ url?: string | null }>)()
          : await (mutate as (i: TInput) => Promise<{ url?: string | null }>)(input)
      if (res?.url) {
        window.location.href = res.url
      } else {
        toast.error(i18n.t(messages.missingUrl))
      }
    } catch (err) {
      console.error('[Billing]', err)
      toast.error(i18n.t(messages.failed))
    }
  }) as TInput extends void ? () => Promise<void> : (input: TInput) => Promise<void>
}

/**
 * Lance le Checkout d'abonnement Stripe pour le `planId` sélectionné.
 * `redirect(planId)` prend la mutation en charge + la redirection +
 * l'erreur — le call-site n'a plus qu'à wire un `onClick`.
 */
export function useStripeCheckoutRedirect(): StripeRedirectAction<{
  plan: string
  annual: boolean
  extra_seats?: number
}> {
  const checkout = useCheckout()
  const redirect = useCallback(
    makeRedirect<{ plan: string; annual: boolean; extra_seats?: number }>(
      input => checkout.mutateAsync(input),
      CHECKOUT_MESSAGES,
    ),
    [checkout],
  )
  return { pending: checkout.isPending, redirect }
}

/** Ouvre le portail Stripe (gestion abonnement + carte). */
export function useStripePortalRedirect(): StripeRedirectAction<void> {
  const portal = usePortal()
  const redirect = useCallback(
    makeRedirect<void>(() => portal.mutateAsync(), PORTAL_MESSAGES),
    [portal],
  )
  return { pending: portal.isPending, redirect }
}

/** Lance Checkout en mode `setup` pour pré-enregistrer une carte. */
export function useStripeAddPaymentMethodRedirect(): StripeRedirectAction<void> {
  const setup = useSetupPaymentMethod()
  const redirect = useCallback(
    makeRedirect<void>(() => setup.mutateAsync(), SETUP_MESSAGES),
    [setup],
  )
  return { pending: setup.isPending, redirect }
}
