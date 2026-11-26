import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { SettingsTabs } from '@/features/settings/components/SettingsTabs'
import { memo, useCallback, useEffect, useState } from 'react'
import { BillingHeader } from '../components/dashboard/BillingHeader'
import { BillingSkeleton } from '../components/dashboard/BillingSkeleton'
import { BillingUnavailable } from '../components/dashboard/BillingUnavailable'
import { InvoiceHistoryCard } from '../components/dashboard/InvoiceHistoryCard'
import { PlanCard } from '../components/dashboard/PlanCard'
import { PaymentMethodCard } from '../components/PaymentMethodCard'
import { PlanPickerDialog } from '../components/PlanPickerDialog'
import { NoLicenseBanner } from '../components/NoLicenseBanner'
import { useBillingDashboard } from '../hooks/useBillingDashboard'

type BillingTab = 'abonnement' | 'factures'

/**
 * Théo D settings-outils.R3 — la facturation en onglets (Abonnement · Factures & paiement). Les mêmes cartes
 * qu'avant, rangées. Pas d'onglet Crédits : plus aucun compteur ni coût n'est affiché dans l'app (#4463 / #4464).
 */
export const Billing = memo(function Billing({
  openPlans = false,
}: {
  /** Arrivée avec l'intention « voir les offres » (bandeau, carte d'upsell). */
  openPlans?: boolean
} = {}) {
  const { addPaymentMethod, checkout, hasPaymentMethod, invoicesLoading, isLoading, model, portal, refetch } =
    useBillingDashboard()
  const [planPickerOpen, setPlanPickerOpen] = useState(openPlans)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [tab, setTab] = useState<BillingTab>('abonnement')
  const { t } = useTranslation('billing')

  const hasSubscription = model?.hasSubscription ?? false

  // Subscriber → Stripe billing portal (change plan / card / cancel).
  // Free / no customer yet → open the plan picker to start a real Checkout.
  const manageSubscription = useCallback(() => {
    if (hasSubscription) void portal.redirect()
    else setPlanPickerOpen(true)
  }, [hasSubscription, portal])

  // Une nouvelle demande alors qu'on est DÉJÀ sur l'écran : le composant n'est
  // pas remonté, donc l'état initial ne suffit pas — c'est exactement le cas
  // « je clique Voir les offres depuis la facturation » qui ne faisait rien.
  useEffect(() => {
    if (openPlans) {
      setTab('abonnement')
      setPlanPickerOpen(true)
    }
  }, [openPlans])

  const selectPlan = useCallback(
    (planId: string, annual: boolean, extraSeats = 0) => {
      setSelectedPlanId(planId)
      void checkout.redirect({ plan: planId, annual, extra_seats: extraSeats }).finally(() => setSelectedPlanId(null))
    },
    [checkout],
  )

  if (isLoading) return <BillingSkeleton />
  // No model with nothing in flight = the balance request failed. Say so, and
  // offer a retry. Falling through to the skeleton here left the billing screen
  // shimmering forever with no error, no retry and no toast (the global
  // `onError` only surfaces 429s), so the user could not tell "loading" from
  // "billing is broken" — and inventing a plan card would be worse still.
  if (!model) return <BillingUnavailable onRetry={() => void refetch()} />

  const portalPending = hasSubscription && portal.pending

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' as const }}
      className="flex w-full flex-col gap-4 pb-8"
    >
      <BillingHeader />
      <NoLicenseBanner onChoosePlan={() => setPlanPickerOpen(true)} />
      {/* Théo D settings-outils (Facturation) — deux onglets : l'abonnement, les factures et le paiement.
          Le calculateur de rentabilité est retiré (#4531). Les crédits n'y sont PAS : plus aucun compteur affiché (#4463). */}
      <SettingsTabs
        label={t('header.title')}
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            key: 'abonnement',
            label: t('tabs.subscription'),
            content: <PlanCard model={model} managing={portalPending} onManage={manageSubscription} />,
          },
          {
            key: 'factures',
            label: t('tabs.invoices'),
            content: (
              <div className="flex flex-col gap-4">
                {/* #4466 — le moyen de paiement n'est pas géré par un membre : le plan est celui du propriétaire de
                    l'espace, qui porte aussi la carte. */}
                {model.isBillingOwner ? (
                  <PaymentMethodCard
                    hasSubscription={hasSubscription}
                    hasPaymentMethod={hasPaymentMethod}
                    onManage={() => void portal.redirect()}
                    onAddPaymentMethod={() => void addPaymentMethod.redirect()}
                    managing={portal.pending}
                    addingPaymentMethod={addPaymentMethod.pending}
                  />
                ) : null}
                <InvoiceHistoryCard invoices={model.invoices} loading={invoicesLoading} />
              </div>
            ),
          },
        ]}
      />
      <PlanPickerDialog
        open={planPickerOpen}
        onOpenChange={setPlanPickerOpen}
        currentPlanId={model.currentPlanId}
        loadingPlanId={selectedPlanId}
        onSelectPlan={selectPlan}
      />
    </motion.div>
  )
})
