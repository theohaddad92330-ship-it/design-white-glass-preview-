import { Badge, Box, Button, cn, Switch, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { ANNUAL_DISCOUNT, DEFAULT_CURRENCY, formatCurrencyAmount, type BillingCurrency } from '@bellum/contracts'
import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBillingCurrency } from '@/features/credits/hooks/useCheckout'
import { usePlans } from '@/features/credits/hooks/usePlans'
import { getPlans, type PlanCatalog } from '@/lib/plans'

type PlanDef = {
  id: string
  name: string
  period: string
  description: string
  features: readonly string[]
  recommended: boolean
  /** Devise réellement affichée. */
  currency: BillingCurrency
  /** Montant mensuel en unités mineures de {@link currency}. */
  priceCents: number
  /**
   * Prix mensuel d'UN siège au-delà des sièges inclus, dans la MÊME devise et
   * les mêmes unités mineures que {@link priceCents}.
   *
   * Il remplace le prix en euros qui vivait ici : la carte affichait son
   * abonnement dans la devise de l'espace et le siège en euros, avec un `€`
   * concaténé dans la traduction. Un montant se formate à partir de son nombre
   * ET de sa devise — les deux doivent donc voyager ensemble.
   */
  extraSeatPriceCents: number
  /** La devise demandée n'avait pas de prix déclaré : la carte est en euros. */
  currencyFellBack: boolean
}

/** Minimal shape of `t` needed here — avoids depending on react-i18next's generic overloads. */
type Translate = (key: string) => string

function buildPlans(t: Translate, catalog: PlanCatalog | undefined, currency: BillingCurrency): PlanDef[] {
  return getPlans(catalog, currency).map(p => {
    const description =
      p.accounts >= 999_999
        ? t('plansGrid.descriptionLargeTeam')
        : p.accounts > 10
          ? t('plansGrid.descriptionGrowingTeam')
          : p.accounts > 3
            ? t('plansGrid.descriptionActiveRep')
            : t('plansGrid.descriptionDiscover')

    return {
      // Server plan code (starter/team/growth) — NOT derived from the display
      // name ("Starter-Solo" is plan `starter`); this id feeds the checkout.
      id: p.id,
      name: p.name,
      period: p.period,
      description,
      features: p.features,
      recommended: p.recommended,
      extraSeatPriceCents: p.extraSeatPriceCents,
      currency: p.currency,
      priceCents: p.priceCents,
      currencyFellBack: p.currencyFellBack,
    }
  })
}

type BillingCycleToggleProps = {
  isAnnual: boolean
  onChange: (next: boolean) => void
}

function BillingCycleToggle({ isAnnual, onChange }: BillingCycleToggleProps) {
  const { t } = useTranslation('billing')
  return (
    <Box display="flex" className="items-center gap-3 justify-center">
      <Text size="sm" color={isAnnual ? 'text-[var(--text-ghost)]' : 'text-[var(--text-secondary)]'} element="span">
        {t('plansGrid.monthlyLabel')}
      </Text>
      <Switch checked={isAnnual} onCheckedChange={onChange} aria-label={t('plansGrid.annualSwitchAria')} />
      <Text size="sm" color={isAnnual ? 'text-[var(--text-secondary)]' : 'text-[var(--text-ghost)]'} element="span">
        {t('plansGrid.annualLabel')}
      </Text>
      <Badge variant="success" className="text-xs">
        -20%
      </Badge>
    </Box>
  )
}

type PlanCardProps = {
  plan: PlanDef
  isAnnual: boolean
  isCurrent: boolean
  loading: boolean
  onSelect: () => void
}

function PlanCard({ plan, isAnnual, isCurrent, loading, onSelect }: PlanCardProps) {
  const { t, i18n } = useTranslation('billing')
  // Le calcul reste en unités mineures : diviser puis arrondir ferait diverger
  // le montant affiché de celui que Stripe prélève.
  const monthlyCents = isAnnual ? Math.round(plan.priceCents * ANNUAL_DISCOUNT) : plan.priceCents
  /**
   * Le total annuel et l'économie, en unités MINEURES et dans la devise de la
   * carte.
   *
   * ⚠️ L'ARITHMÉTIQUE EST CELLE D'AVANT, au centime près, et c'est délibéré :
   * ce changement-ci ne porte que sur le FORMATAGE. Les deux montants se
   * dérivaient de `priceEuros` — donc en euros — pendant que le prix mensuel
   * juste au-dessus se formatait depuis `priceCents` dans la devise de
   * l'espace. Une carte pouvait afficher « US$207.00 /mois » puis « ou
   * 2484€/an » : deux devises sur la même carte, et c'est celle du bas qui
   * était fausse. On arrondit donc toujours à l'unité MAJEURE entière avant de
   * multiplier, exactement comme avant, mais on part du montant de la bonne
   * devise.
   *
   * ⚠️ CE QUI RESTE FAUX, ET QUI N'EST PAS DE CE LOT : ce total n'est pas celui
   * que la caisse prélève. Le serveur fait foi et calcule
   * `Math.round((cents / 100) * ANNUAL_DISCOUNT * 12) * 100`
   * (`apps/api/src/modules/credits/pricing.ts:32`), soit 2 486 € pour Team,
   * pendant que cette carte annonce 2 484 € — l'arrondi est appliqué au mois
   * ici, à l'année là-bas. Corriger l'écart veut dire déplacer
   * `cycleUnitAmountCents` dans les contrats pour que les deux bouts lisent LA
   * formule (GA-26), c'est-à-dire toucher au chemin de facturation. Parqué avec
   * sa mesure plutôt qu'improvisé.
   */
  const annualMonthlyCents = Math.round((plan.priceCents / 100) * ANNUAL_DISCOUNT) * 100
  const annualTotalCents = annualMonthlyCents * 12
  const annualSavingCents = plan.priceCents * 12 - annualTotalCents

  return (
    <motion.div
      className={cn(
        'relative flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm dark:bg-neutral-900',
        plan.recommended
          ? 'border-[color-mix(in_srgb,var(--bellum-primary-500)_40%,var(--bellum-border))]'
          : 'border-neutral-200 dark:border-white/10',
      )}
    >
      {plan.recommended && (
        <Badge variant="primary" className="mb-4 w-fit text-xs">
          {t('plansGrid.recommendedBadge')}
        </Badge>
      )}

      <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]" className="mb-1">
        {plan.name}
      </Text>
      <Text size="xs" color="text-[var(--text-ghost)]">
        {plan.description}
      </Text>

      <Box my={4}>
        <Box display="flex" className="items-baseline gap-1">
          <Text element="span" size="4xl" weight="bold" className="font-mono text-[var(--bellum-text-primary)]">
            {formatCurrencyAmount(monthlyCents, plan.currency, i18n.language)}
          </Text>
          {plan.period && (
            <Text element="span" size="sm" color="text-[var(--text-muted)]">
              {t('plansGrid.perMonth')}
            </Text>
          )}
        </Box>
        {isAnnual && plan.priceCents > 0 && (
          <>
            <Text size="xs" color="text-[var(--text-ghost)]" className="mt-0.5">
              {t('plansGrid.orPerYear', {
                amount: formatCurrencyAmount(annualTotalCents, plan.currency, i18n.language),
              })}
            </Text>
            {/* L'économie en EUROS (§11). « -20 % » est un pourcentage ; ce qui
                décide un acheteur, c'est le montant qu'il garde. Le calculer de
                tête à partir de deux nombres affichés ailleurs est un travail
                qu'on n'a pas à lui laisser. */}
            <Text size="xs" color="text-[var(--success-soft-text)]" className="mt-0.5" weight="medium">
              {t('plansGrid.annualSaving', {
                amount: formatCurrencyAmount(annualSavingCents, plan.currency, i18n.language),
              })}
            </Text>
          </>
        )}
        {/* Le siège en plus n'a pas le même prix selon le palier : il se lit SUR
            la carte, là où le choix se fait — le résumé « à partir de » du
            sélecteur ne dit pas ce que coûtera CE plan.
            ⚠️ Un prix de siège à ZÉRO ne veut pas dire « siège gratuit », il veut
            dire que ce palier n'en vend pas (Growth est mono-utilisateur depuis
            le 27/08). Afficher « +0 € / siège » inviterait à un achat qui
            n'existe pas — la carte dit alors où va la deuxième personne. */}
        {plan.extraSeatPriceCents > 0 ? (
          <Text size="xs" color="text-[var(--text-ghost)]" className="mt-1">
            {t('plansGrid.extraSeatPrice', {
              price: formatCurrencyAmount(plan.extraSeatPriceCents, plan.currency, i18n.language),
            })}
          </Text>
        ) : (
          <Text size="xs" color="text-[var(--text-ghost)]" className="mt-1">
            {t('plansGrid.singleSeatOnly')}
          </Text>
        )}
      </Box>

      <Box className="h-px bg-[var(--border-subtle)] mb-4" />

      <ul className="space-y-2.5 mb-6 flex-1">
        {plan.features.map(f => (
          <li key={f} className="flex gap-2.5 items-start">
            <Check className="size-3.5 shrink-0 mt-0.5 text-[var(--success-soft-text)]" />
            <Text size="sm" color="text-[var(--text-secondary)]" element="span">
              {f}
            </Text>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <Button variant="outline" size="sm" disabled fullWidth>
          {t('plansGrid.currentPlanCta')}
        </Button>
      ) : (
        <Button
          variant={plan.recommended ? 'default' : 'outline'}
          size="sm"
          fullWidth
          onClick={onSelect}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
              {t('plansGrid.loadingCta')}
            </>
          ) : (
            t('plansGrid.selectCta')
          )}
        </Button>
      )}
    </motion.div>
  )
}

type PlansGridProps = {
  currentPlanId: string
  loadingPlanId: string | null
  onSelect: (planId: string, annual: boolean) => void
}

export const PlansGrid = memo<PlansGridProps>(function PlansGrid({ currentPlanId, loadingPlanId, onSelect }) {
  const { t } = useTranslation('billing')
  const [isAnnual, setIsAnnual] = useState(false)
  // Live catalog: an operator's price edit must reach these cards, otherwise the
  // screen quotes one amount and Stripe charges another.
  //
  // On failure we still render the shipped baseline — a pricing page with no
  // prices helps nobody — but we SAY that the amounts are unconfirmed. Quoting
  // a stale 119 € silently is the failure-as-fact shape: the user takes a
  // purchase decision on a number we could not verify.
  const { data: catalog, isError: catalogFailed } = usePlans()
  // La devise vient du SERVEUR : elle dépend du pays de facturation de l'espace
  // et, surtout, de ce qui a déjà été facturé (Stripe ne change pas la devise
  // d'un abonnement en cours). Tant qu'elle n'a pas répondu, on reste en euros.
  const { data: billingCurrency } = useBillingCurrency()
  const currency = billingCurrency?.currency ?? DEFAULT_CURRENCY
  const plans = useMemo(() => buildPlans(t, catalog, currency), [t, catalog, currency])
  // Un seul repli suffit à le dire : les trois cartes retombent ensemble.
  const showsEuroFallback = plans.some(plan => plan.currencyFellBack)

  return (
    <div id="plans-section" className="space-y-6">
      <Box>
        <Text element="h2" size="base" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {t('plansGrid.title')}
        </Text>
        <Text size="xs" color="text-[var(--text-ghost)]" className="mt-0.5">
          {t('plansGrid.subtitle')}
        </Text>
      </Box>

      {catalogFailed && (
        <Box role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-center">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('plansGrid.unconfirmedPrices')}
          </Text>
        </Box>
      )}

      {showsEuroFallback && (
        <Box role="status" className="rounded-lg border border-[var(--bellum-border)] px-3 py-2 text-center">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('plansGrid.billedInEuros')}
          </Text>
        </Box>
      )}

      <BillingCycleToggle isAnnual={isAnnual} onChange={setIsAnnual} />

      {/* Trois offres, trois colonnes : la grille était restée à 4 colonnes d'un
          temps où il y avait un palier gratuit, ce qui laissait une colonne vide
          à droite et des cartes serrées pour rien. */}
      <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.4, ease: 'easeOut' as const }}
          >
            <PlanCard
              plan={plan}
              isAnnual={isAnnual}
              isCurrent={plan.id === currentPlanId}
              loading={loadingPlanId === plan.id}
              onSelect={() => onSelect(plan.id, isAnnual)}
            />
          </motion.div>
        ))}
      </Box>
    </div>
  )
})
