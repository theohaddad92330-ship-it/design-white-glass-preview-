'use client'

import { Card, Text, cn } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CheckIcon } from '@/components/ui/check'
import { Link } from '@/i18n/navigation'
import { demoUrl, signupUrl, talkToTeamUrl } from '@/lib/app-url'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/lib/button-styles'
import { fillLiveTokens, livePlan, PLAN_ORDER, type LiveCatalogCopy } from './live-prices'

type Plan = {
  name: string
  badge?: string
  price: { monthly: string; annual: string }
  per?: string
  sub: { monthly: string; annual: string }
  cta: string
  featured?: boolean
  features: readonly string[]
}

/** La carte gratuite : pas un palier, la démonstration en libre-service. */
type FreeCard = { name: string; price: string; tagline: string; cta: string; sub: string; features: readonly string[] }

/** La carte sur devis : pas de prix, donc pas de bascule mensuel/annuel. */
type EnterpriseCard = {
  name: string
  badge: string
  price: string
  cta: string
  sub: string
  features: readonly string[]
}

// The visible strings (name, prices, per, sub, cta, features) live in
// `messages/<locale>/pricing.json` under `plans.items`; only the `featured`
// flag stays here and is zipped by index (order must match the JSON array).
// PRICES: the catalog strings are a FALLBACK. When the page supplies
// `livePrices` (fetched from the operator-editable catalog), those win — a
// price edited in the backoffice has to reach the marketing site, otherwise it
// advertises one amount and Stripe charges another.
//
// `items` ne contient que les paliers ACHETABLES (Starter, Growth). Les deux
// autres cartes — la démonstration gratuite et le devis Team / Enterprise — ne
// sont pas des paliers du catalogue : l'une n'a aucun compte à provisionner,
// l'autre n'a pas de prix. Les ranger dans le même tableau obligerait à leur
// inventer un montant, que le garde de parité comparerait ensuite à un plan
// inexistant.
const FEATURED: readonly boolean[] = [false, true]

const PRIMARY_BLOCK = cn(PRIMARY_BUTTON, 'w-full')
const SECONDARY_BLOCK = cn(SECONDARY_BUTTON, 'w-full')

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const t = useTranslations('pricing')

  return (
    <Card
      className={cn(
        'group relative flex flex-col gap-5 rounded-3xl bg-transparent p-7 transition-all duration-300 hover:-translate-y-1.5',
        plan.featured
          ? 'border-violet-500/45 bg-[linear-gradient(180deg,rgba(123,97,255,0.1),rgba(123,97,255,0.02))] shadow-[0_30px_70px_-30px_rgba(123,97,255,0.5)] hover:border-violet-500/65'
          : 'border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] backdrop-blur-[16px] hover:border-violet-500/40',
      )}
    >
      {plan.featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,#9b85ff,#5b3fe0)] px-3 py-1 text-white">
          {t('plans.featuredBadge')}
        </span>
      )}

      <Text element="h2" size="lg" weight="medium" color="text-zinc-200">
        {plan.name}
      </Text>

      {plan.badge && (
        <span className="w-fit rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-sm text-violet-200">
          {plan.badge}
        </span>
      )}

      <div className="flex items-baseline gap-1.5">
        <Text element="span" weight="bold" color="text-white" className="text-[clamp(34px,4vw,46px)]">
          {annual ? plan.price.annual : plan.price.monthly}
        </Text>
        {plan.per && (
          <Text element="span" size="sm" color="text-zinc-500">
            {plan.per}
          </Text>
        )}
      </div>

      <Text element="h4" size="sm" color="text-zinc-500" className="min-h-[40px]">
        {annual ? plan.sub.annual : plan.sub.monthly}
      </Text>

      <a href={signupUrl()} className={plan.featured ? PRIMARY_BLOCK : SECONDARY_BLOCK}>
        {plan.cta}
      </a>

      <ul className="space-y-3">
        {plan.features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5">
            <CheckIcon size={18} className="mt-0.5 shrink-0 text-emerald-400" />
            <Text className="font-sans" element="span" size="sm" color="text-zinc-300">
              {feature}
            </Text>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * La carte gratuite — celle qui envoie sur la démonstration.
 *
 * Elle n'affiche ni bascule mensuel/annuel ni bouton d'inscription : ce qu'elle
 * propose n'est pas un abonnement à 0 €, c'est un produit qu'on ouvre sans
 * compte. Le bouton part vers `app.bellum-ai.com/demo`, où une salle est louée
 * au visiteur.
 */
function FreePlanCard({ card }: { card: FreeCard }) {
  return (
    <Card className="group relative flex flex-col gap-5 rounded-3xl border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-7 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1.5 hover:border-violet-500/40">
      <Text element="h2" size="lg" weight="medium" color="text-zinc-200">
        {card.name}
      </Text>

      <div className="flex items-baseline gap-1.5">
        <Text element="span" weight="bold" color="text-white" className="text-[clamp(34px,4vw,46px)]">
          {card.price}
        </Text>
      </div>

      <Text element="h4" size="sm" color="text-violet-300" className="min-h-[40px]">
        {card.tagline}
      </Text>

      <a href={demoUrl()} className={SECONDARY_BLOCK}>
        {card.cta}
      </a>

      <Text size="sm" color="text-zinc-500">
        {card.sub}
      </Text>

      <ul className="space-y-3">
        {card.features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5">
            <CheckIcon size={18} className="mt-0.5 shrink-0 text-emerald-400" />
            <Text className="font-sans" element="span" size="sm" color="text-zinc-300">
              {feature}
            </Text>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * La carte sur devis.
 *
 * Aucun prix n'est affiché parce qu'aucun prix n'est décidé : une équipe négocie
 * son enveloppe. Écrire « à partir de » ici reviendrait à annoncer un montant
 * que personne ne s'est engagé à tenir.
 */
function EnterprisePlanCard({ card, href }: { card: EnterpriseCard; href: string }) {
  return (
    <Card className="group relative flex flex-col gap-5 rounded-3xl border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-7 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1.5 hover:border-violet-500/40">
      <Text element="h2" size="lg" weight="medium" color="text-zinc-200">
        {card.name}
      </Text>

      <span className="w-fit rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-sm text-violet-200">
        {card.badge}
      </span>

      <Text element="span" weight="bold" color="text-white" className="text-[clamp(28px,3.2vw,38px)]">
        {card.price}
      </Text>

      <a href={href} className={SECONDARY_BLOCK}>
        {card.cta}
      </a>

      <Text size="sm" color="text-zinc-500">
        {card.sub}
      </Text>

      <ul className="space-y-3">
        {card.features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5">
            <CheckIcon size={18} className="mt-0.5 shrink-0 text-emerald-400" />
            <Text className="font-sans" element="span" size="sm" color="text-zinc-300">
              {feature}
            </Text>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function PricingPlans({ live }: { live: LiveCatalogCopy }) {
  const t = useTranslations('pricing')
  const [annual, setAnnual] = useState(false)
  // `plans.items` liste exactement les paliers achetables, dans l'ordre de
  // `PLAN_ORDER` — mais on joint par CODE et non par position : c'est cette
  // jointure-là qui reste vraie le jour où une carte s'ajoute au milieu.
  const plans: Plan[] = (t.raw('plans.items') as Omit<Plan, 'featured'>[]).map((item, index) => {
    const { price, seat } = livePlan(live, PLAN_ORDER[index] ?? null)
    return {
      ...item,
      price: price ?? item.price,
      // The bullets name their tier, so each gets ITS OWN seat price.
      features: item.features.map(feature => fillLiveTokens(feature, { seatPrice: seat })),
      featured: FEATURED[index],
    }
  })
  const free = t.raw('plans.free') as FreeCard
  const enterprise = t.raw('plans.enterprise') as EnterpriseCard
  // Sans lien de prise de rendez-vous configuré, on retombe sur le formulaire de
  // demande du site : il envoie un e-mail. Un bouton qui ouvre une page blanche
  // serait pire que pas de bouton, et c'est celui du palier le plus cher.
  const teamHref = talkToTeamUrl() ?? '/demo'

  return (
    <section className="py-8">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.025] p-1.5">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn(
                'rounded-full px-5 py-2 text-sm font-medium transition-colors',
                annual ? 'text-zinc-400' : 'bg-violet-500/[0.22] text-white shadow-[0_0_0_1px_rgba(123,97,255,0.4)]',
              )}
            >
              {t('plans.monthly')}
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors',
                annual ? 'bg-violet-500/[0.22] text-white shadow-[0_0_0_1px_rgba(123,97,255,0.4)]' : 'text-zinc-400',
              )}
            >
              {t('plans.annual')}
              <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-xs text-violet-300">
                {t('plans.annualBadge')}
              </span>
            </button>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FreePlanCard card={free} />
          {plans.map(plan => (
            <PlanCard key={plan.name} plan={plan} annual={annual} />
          ))}
          <EnterprisePlanCard card={enterprise} href={teamHref} />
        </div>

        {/* Le bandeau des règles : ce qu'achète un crédit, ce qu'il devient s'il
            n'est pas consommé, la remise annuelle. Trois promesses tenues par le
            produit — le report de 30 jours est implémenté côté crédits. */}
        <div className="mx-auto mt-8 grid max-w-6xl gap-4 rounded-2xl border border-white/[0.12] bg-white/[0.02] p-6 sm:grid-cols-2 lg:grid-cols-4">
          {[t('plans.notes.credit'), t('plans.notes.rollover'), t('plans.notes.annual'), t('plans.notes.custom')].map(
            note => (
              <Text key={note} size="sm" color="text-zinc-400">
                {note}
              </Text>
            ),
          )}
        </div>

        <Text className="mx-auto mt-4 max-w-6xl rounded-2xl border border-white/[0.12] bg-white/[0.02] p-6 text-center text-sm text-zinc-400">
          {t('plans.notes.footer')}
        </Text>

        <Text className="mt-6 text-center text-sm text-zinc-500">
          {t('plans.multiTeamQuestion')}{' '}
          <Link
            href="/demo"
            className="group ml-1 inline-flex items-center gap-1.5 font-medium text-violet-300 transition-colors hover:text-violet-200"
          >
            {t('plans.multiTeamCta')}
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Text>
      </div>
    </section>
  )
}
