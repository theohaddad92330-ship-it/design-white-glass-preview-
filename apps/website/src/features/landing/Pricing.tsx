import { Card, Text, cn } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { CheckIcon } from '@/components/ui/check'
import { demoUrl, signupUrl, talkToTeamUrl } from '@/lib/app-url'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/lib/button-styles'
import { fillLiveTokens, livePlan, type LiveCatalogCopy, type PlanKey } from '@/features/pricing/live-prices'
import { Kicker } from './Kicker'

type Plan = {
  name: string
  price: string
  per?: string
  desc: string
  cta: string
  features: readonly string[]
}

// L'ordre des cartes suit le catalogue de messages : Free, Growth, Entreprise.
// Growth est mis en avant — depuis la grille du 27/08, c'est le SEUL palier
// achetable, donc le seul qui puisse l'être.
const FEATURED = [false, true, false] as const

/**
 * Le palier de chaque carte — `null` quand la carte n'en est pas un.
 *
 * Free est la démonstration publique (rien à provisionner) et Entreprise est
 * sur devis : ni l'un ni l'autre n'existe dans le catalogue live, qui ne
 * contient que les paliers achetables. C'est ce tableau qui empêche une carte de
 * récupérer le prix de sa voisine — le défaut vu en production, où « Free »
 * annonçait 119 € et « Starter » 249 €. Deux cartes sur trois valent désormais
 * `null`, ce qui rend la jointure par position encore plus dangereuse : elle
 * décalerait le seul prix qui existe.
 */
const PLAN_KEYS: readonly (PlanKey | null)[] = [null, 'growth', null]

/**
 * Où mène le bouton d'une carte.
 *
 * Le palier payant envoie vers l'inscription ; la carte gratuite ouvre la
 * démonstration (rien à acheter) et la carte sur devis mène à la prise de
 * rendez-vous. Faire pointer les trois vers l'inscription enverrait un visiteur
 * curieux remplir un formulaire de paiement pour voir un produit.
 */
function ctaHref(index: number, total: number): string {
  if (index === 0) return demoUrl()
  if (index === total - 1) return talkToTeamUrl() ?? '/demo'
  return signupUrl()
}

const PRIMARY_BLOCK = cn(PRIMARY_BUTTON, 'w-full')
const SECONDARY_BLOCK = cn(SECONDARY_BUTTON, 'w-full')

function PlanCard({
  plan,
  featured,
  mostPopular,
  href,
}: {
  plan: Plan
  featured: boolean
  mostPopular: string
  href: string
}) {
  return (
    <Card
      className={cn(
        'group relative flex flex-col gap-5 rounded-3xl bg-transparent p-7 transition-all duration-300 hover:-translate-y-1.5',
        featured
          ? 'border-violet-500/45 bg-[linear-gradient(180deg,rgba(123,97,255,0.1),rgba(123,97,255,0.02))] shadow-[0_30px_70px_-30px_rgba(123,97,255,0.5)] hover:border-violet-500/65'
          : 'border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] backdrop-blur-[16px] hover:border-violet-500/40',
      )}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,#9b85ff,#5b3fe0)] px-3 py-1 text-white">
          {mostPopular}
        </span>
      )}

      <Text element="h3" size="lg" weight="medium" color="text-zinc-200">
        {plan.name}
      </Text>

      <div className="flex items-baseline gap-1.5">
        <Text element="span" weight="bold" color="text-white" className="text-[clamp(34px,4vw,46px)]">
          {plan.price}
        </Text>
        {plan.per && (
          <Text element="span" size="sm" color="text-zinc-500">
            {plan.per}
          </Text>
        )}
      </div>

      <Text element="p" size="sm" color="text-zinc-500" className="min-h-[40px] leading-relaxed">
        {plan.desc}
      </Text>

      <a href={href} className={featured ? PRIMARY_BLOCK : SECONDARY_BLOCK}>
        {plan.cta}
      </a>

      <ul className="space-y-3">
        {plan.features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5">
            <CheckIcon size={18} className="mt-0.5 shrink-0 text-emerald-400" />
            <Text element="span" size="sm" color="text-zinc-300">
              {feature}
            </Text>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function Pricing({ live }: { live: LiveCatalogCopy }) {
  const t = useTranslations('home.pricing')
  // Catalog strings are a FALLBACK: a price edited in the backoffice must reach
  // the landing page rather than advertise an amount Stripe no longer charges.
  // La surcharge se fait par CODE de palier (`PLAN_KEYS`), jamais par position.
  const plans = (t.raw('plans') as Plan[]).map((plan, index) => {
    const { price, seat } = livePlan(live, PLAN_KEYS[index] ?? null)
    return {
      ...plan,
      price: price?.monthly ?? plan.price,
      features: plan.features.map(feature => fillLiveTokens(feature, { seatPrice: seat })),
    }
  })
  const mostPopular = t('mostPopular')

  return (
    <section className="relative overflow-hidden py-24">
      <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 select-none text-[clamp(120px,21vw,300px)] font-bold leading-none text-white/[0.025]">
        {t('watermark')}
      </span>

      <div className="relative mx-auto max-w-7xl px-6 pt-10">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('heading')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-md leading-relaxed">
            {t('paragraph')}
          </Text>
        </div>

        <div className="mx-auto mt-12 grid sm:max-w-sm animate-fade-up items-stretch gap-4 md:max-w-3xl md:grid-cols-2 lg:max-w-6xl xl:grid-cols-3">
          {plans.map((plan, i) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              featured={FEATURED[i] ?? false}
              mostPopular={mostPopular}
              href={ctaHref(i, plans.length)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
