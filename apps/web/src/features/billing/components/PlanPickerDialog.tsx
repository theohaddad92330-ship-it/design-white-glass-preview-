import { DEFAULT_CURRENCY, formatCurrencyAmount } from '@bellum/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlans } from '@/features/credits/hooks/usePlans'
import { seatPriceSummary } from '@/lib/plans'
import { PlansGrid } from './PlansGrid'

/** Extra seats beyond the plan's included allowance (varies per tier —
 *  Starter-Solo 1 · Team 3 · Growth 8). The API caps the count at 47
 *  (server-authoritative — mirrors MAX_EXTRA_SEATS in credits.service.ts); the
 *  per-seat PRICE is per-plan and read from the live catalog below. */
const MAX_EXTRA_SEATS = 47

type PlanPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlanId: string
  /** Plan dont le Checkout est en cours (spinner sur la carte), sinon null. */
  loadingPlanId: string | null
  onSelectPlan: (planId: string, annual: boolean, extraSeats: number) => void
}

/**
 * Sélecteur de plan présenté aux utilisateurs sans abonnement actif. Chaque
 * carte lance un vrai Stripe Checkout via `onSelectPlan`. Réutilise `PlansGrid`
 * (mensuel/annuel, plan courant grisé) dans une modale.
 *
 * Le sélecteur de sièges supplémentaires n'apparaît QUE si un palier achetable
 * en vend. Depuis la grille du 27/08, aucun n'en vend : Growth est un poste de
 * travail mono-utilisateur, et la deuxième personne passe par un devis
 * Entreprise. Le bloc disparaît donc entièrement plutôt que d'afficher
 * « à partir de +0 € », qui inviterait à un achat inexistant.
 */
export function PlanPickerDialog({
  open,
  onOpenChange,
  currentPlanId,
  loadingPlanId,
  onSelectPlan,
}: PlanPickerDialogProps) {
  const { t, i18n } = useTranslation('billing')
  const [extraSeats, setExtraSeats] = useState(0)
  // The add-on price is per-plan, and no plan is selected yet at this point —
  // show the single figure when every self-serve tier agrees, and a "from X"
  // otherwise rather than quoting one tier's price as if it were universal.
  const { data: catalog } = usePlans()
  const seatPrice = seatPriceSummary(catalog)
  const clamp = (n: number) => Math.max(0, Math.min(n, MAX_EXTRA_SEATS))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('planPicker.title')}</DialogTitle>
          <DialogDescription>{t('planPicker.description')}</DialogDescription>
        </DialogHeader>

        <PlansGrid
          currentPlanId={currentPlanId}
          loadingPlanId={loadingPlanId}
          onSelect={(planId, annual) => onSelectPlan(planId, annual, extraSeats)}
        />

        {seatPrice.sellable ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3">
            <div className="min-w-0">
              <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                {t('planPicker.extraSeatsTitle')}
              </Text>
              <Text element="p" size="xs" color="var(--bellum-text-secondary)">
                {/* Le résumé « à partir de » agrège les prix EUROS du catalogue :
                    il n'est pas propre à une devise, donc il s'annonce dans la
                    devise de référence et le DIT en la formatant, au lieu de
                    coller un `€` écrit dans la traduction. Le prix EXACT du
                    siège, dans la devise de l'espace, se lit sur la carte du
                    palier juste au-dessus. */}
                {t(seatPrice.uniform ? 'planPicker.extraSeatsSubtitle' : 'planPicker.extraSeatsSubtitleFrom', {
                  price: formatCurrencyAmount(seatPrice.fromCents, DEFAULT_CURRENCY, i18n.language),
                })}
              </Text>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                aria-label={t('planPicker.removeSeatAria')}
                disabled={extraSeats <= 0}
                onClick={() => setExtraSeats(s => clamp(s - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <Text element="span" size="sm" weight="semibold" className="w-10 text-center tabular-nums">
                +{extraSeats}
              </Text>
              <Button
                size="icon"
                variant="outline"
                aria-label={t('planPicker.addSeatAria')}
                disabled={extraSeats >= MAX_EXTRA_SEATS}
                onClick={() => setExtraSeats(s => clamp(s + 1))}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Text element="p" size="xs" color="var(--bellum-text-secondary)" className="mt-2">
            {t('planPicker.singleSeatOnly')}
          </Text>
        )}
      </DialogContent>
    </Dialog>
  )
}
