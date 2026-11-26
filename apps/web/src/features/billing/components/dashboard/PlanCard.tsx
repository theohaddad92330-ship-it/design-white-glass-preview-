import { Badge, Button } from '@bellum/ui'
import { Loader2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BillingViewModel } from '../../model/billing-view-model'
import { BillingCard, BillingRow } from './BillingCard'
import { BenefitsList, ManagedByOwnerNotice } from './BillingShared'

type PlanCardProps = {
  managing: boolean
  model: BillingViewModel
  onManage: () => void
}

export function PlanCard({ managing, model, onManage }: PlanCardProps) {
  const { t } = useTranslation('billing')
  // Refonte Théo (`.v12-setting-block` « Ton abonnement ») : trois lignes de réglage —
  // la formule et son statut, les sièges, le renouvellement et le geste —, puis ce
  // que la formule ouvre. Aucun crédit : la consommation n'est jamais affichée (#4463).
  return (
    <BillingCard title={t('plan.title')}>
      <BillingRow
        title={model.planLabel}
        description={<BenefitsList items={model.benefits} />}
        aside={
          <Badge variant={model.planStatus === 'active' ? 'success' : 'info'}>
            {model.planStatus === 'active' ? t('plan.statusActive') : t('plan.statusTrial')}
          </Badge>
        }
      />
      <BillingRow
        title={t('plan.seatsLabel')}
        description={model.seatsOverBy > 0 ? t('plan.seatsOver', { count: model.seatsOverBy }) : undefined}
        aside={
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--bellum-text-primary)]">
            <Users className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
            {model.seatsLabel}
          </span>
        }
      />
      {model.isBillingOwner ? (
        <BillingRow
          title={t('plan.renewalRow')}
          description={model.renewalLabel}
          aside={
            <Button
              variant="black"
              size="sm"
              disabled={managing}
              onClick={onManage}
              className="min-h-11 transition-transform active:scale-[0.98] sm:min-h-9"
            >
              {managing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {model.hasSubscription ? t('plan.manageCta') : t('cta.choosePlan')}
            </Button>
          }
        />
      ) : (
        <div className="pt-4">
          <ManagedByOwnerNotice />
        </div>
      )}
    </BillingCard>
  )
}
