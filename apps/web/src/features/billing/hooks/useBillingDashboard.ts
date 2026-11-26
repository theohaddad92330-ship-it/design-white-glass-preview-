import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useStripeAddPaymentMethodRedirect,
  useStripeCheckoutRedirect,
  useStripePortalRedirect,
} from '@/features/credits/hooks/useStripeRedirect'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useInvoices } from '@/features/credits/hooks/useInvoices'
import { usePlans } from '@/features/credits/hooks/usePlans'
import { buildBillingViewModel } from '../model/billing-view-model'

// #4466 — /billing = forfait + moyen de paiement + factures. Ni solde, ni
// historique de crédits, ni recharge : la consommation se lit au back-office.
export function useBillingDashboard() {
  // The view-model builder resolves its labels through i18n.t at call time —
  // the active language is a real input of the memo below.
  const {
    i18n: { language },
  } = useTranslation('billing')
  const { data: credits, isLoading, refetch } = useCredits()
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices()
  const { data: planCatalog } = usePlans()
  const addPaymentMethod = useStripeAddPaymentMethodRedirect()
  const checkout = useStripeCheckoutRedirect()
  const portal = useStripePortalRedirect()

  const model = useMemo(() => {
    void language
    return credits ? buildBillingViewModel(credits, invoicesData?.invoices ?? [], planCatalog) : null
  }, [credits, invoicesData, planCatalog, language])

  return {
    addPaymentMethod,
    checkout,
    /** Un Stripe Customer existe : au moins une carte a été enregistrée. */
    hasPaymentMethod: Boolean(credits?.stripe_customer_id),
    invoicesLoading,
    isLoading,
    model,
    portal,
    /** Retry the credits query — the screen has nothing to show without it. */
    refetch,
  }
}
