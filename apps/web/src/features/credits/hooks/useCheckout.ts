import { useMutation, useQuery } from '@tanstack/react-query'
import type { BillingCurrency } from '@bellum/contracts'
import { creditsApi } from '@/features/credits/api'

export function useCheckout() {
  return useMutation({
    mutationKey: ['credits', 'checkout'],
    mutationFn: (input: { plan: string; annual: boolean; extra_seats?: number; currency?: BillingCurrency }) =>
      creditsApi.checkout(input.plan, input.annual, input.extra_seats ?? 0, input.currency),
  })
}

/**
 * La devise de facturation de l'espace.
 *
 * `locked` dit qu'un abonnement existe déjà : Stripe ne change pas la devise
 * d'un abonnement en cours, donc l'écran affiche la devise sans proposer d'en
 * changer — proposer un choix qui échouerait au paiement serait pire que de
 * n'en proposer aucun.
 */
export function useBillingCurrency() {
  return useQuery({
    queryKey: ['credits', 'currency'],
    queryFn: creditsApi.billingCurrency,
    staleTime: 5 * 60_000,
  })
}

export function usePortal() {
  return useMutation({
    mutationKey: ['credits', 'portal'],
    mutationFn: () => creditsApi.portal(),
  })
}

export function useSetupPaymentMethod() {
  return useMutation({
    mutationKey: ['credits', 'setupPaymentMethod'],
    mutationFn: () => creditsApi.setupPaymentMethod(),
  })
}
