import { Button } from '@bellum/ui'
import { CreditCard, ExternalLink, Loader2, Plus } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { BillingCard, BillingRow } from './dashboard/BillingCard'

type PaymentMethodCardProps = {
  /** L'utilisateur a un abonnement actif (`stripe_subscription_id` présent). */
  hasSubscription: boolean
  /** Stripe Customer existant — implique qu'au moins une carte a été
   *  ajoutée même sans abonnement actif. Quand `true`, on propose
   *  "Gérer" qui ouvre le portail. */
  hasPaymentMethod: boolean
  onManage: () => void
  onAddPaymentMethod: () => void
  managing: boolean
  addingPaymentMethod: boolean
}

export const PaymentMethodCard = memo<PaymentMethodCardProps>(function PaymentMethodCard({
  hasSubscription,
  hasPaymentMethod,
  onManage,
  onAddPaymentMethod,
  managing,
  addingPaymentMethod,
}) {
  const { t } = useTranslation('billing')
  // Le bouton "Gérer" sert dès qu'on a un Stripe Customer — abonnement
  // ou simple carte enregistrée. Sinon on propose d'ajouter une carte.
  const canManage = hasSubscription || hasPaymentMethod

  // Refonte Théo (`.v12-setting-block` « Factures & paiement ») : le bloc commun de la
  // facturation et UNE ligne de réglage — la carte enregistrée ou son absence à gauche,
  // le geste à droite. Plus de gris codés en dur : les jetons des deux thèmes.
  const action = canManage ? (
    <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={onManage} disabled={managing}>
      {managing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 size-3.5" />}
      {t('common:actions.manage')}
    </Button>
  ) : (
    <Button
      variant="black"
      size="sm"
      className="min-h-11 sm:min-h-9"
      onClick={onAddPaymentMethod}
      disabled={addingPaymentMethod}
    >
      {addingPaymentMethod ? (
        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
      ) : (
        <Plus className="mr-1.5 size-3.5" />
      )}
      {t('paymentMethodCard.addCardCta')}
    </Button>
  )

  return (
    <BillingCard title={t('paymentMethodCard.title')} subtitle={t('paymentMethodCard.subtitle')}>
      <BillingRow
        title={
          <span className="inline-flex items-center gap-2">
            <CreditCard className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
            {canManage ? t('paymentMethodCard.savedCardTitle') : t('paymentMethodCard.emptyTitle')}
          </span>
        }
        description={canManage ? t('paymentMethodCard.savedCardSubtitle') : t('paymentMethodCard.emptySubtitle')}
        aside={action}
      />
    </BillingCard>
  )
})
