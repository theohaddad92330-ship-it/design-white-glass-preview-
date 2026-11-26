import type { OfferProposal } from '@bellum/contracts'
import {
  Badge,
  Card,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Clock3,
  Sparkles,
  Target,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function OfferRecommendationsCard({ offers }: { offers: OfferProposal[] }) {
  const [selectedOffer, setSelectedOffer] = useState<OfferProposal | null>(null)

  return (
    <>
      <Card className="gap-0 overflow-hidden p-4 [--card-spacing:0px]">
        <Header count={offers.length} />

        {offers.map((offer, index) => (
          <OfferRow key={`${offer.title}-${index}`} offer={offer} onSelect={setSelectedOffer} />
        ))}
      </Card>
      <OfferSheet offer={selectedOffer} onOpenChange={open => !open && setSelectedOffer(null)} />
    </>
  )
}

function Header({ count }: { count: number }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-4">
      <div className="flex items-center gap-2">
        <BriefcaseBusiness className="size-4 text-[var(--bellum-text-accent)]" />
        <Text element="h3" size="sm" weight="semibold">
          {t('offers.title')}
        </Text>
      </div>
      <Badge variant="default">{count}</Badge>
    </div>
  )
}

function OfferRow({ offer, onSelect }: { offer: OfferProposal; onSelect: (offer: OfferProposal) => void }) {
  const { t } = useTranslation('accountDetail')
  return (
    <button
      type="button"
      onClick={() => onSelect(offer)}
      className="group flex min-h-28 w-full rounded-xl gap-4 px-2 py-4 text-left transition-colors hover:bg-[var(--bellum-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--bellum-primary-500)] "
    >
      <div className="min-w-0">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('offers.proposed')}
        </Text>
        <Text element="h4" size="sm" weight="semibold" className="mt-1">
          {offer.title}
        </Text>
        <Text size="xs" className="mt-1.5 line-clamp-2 leading-relaxed text-[var(--bellum-text-secondary)]">
          {offer.pitch}
        </Text>
        <OfferMetadata offer={offer} />
      </div>
      <ArrowRight className="size-4 self-center ml-auto text-[var(--bellum-text-muted)] transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function OfferMetadata({ offer }: { offer: OfferProposal }) {
  const { t } = useTranslation('accountDetail')
  const items = [
    { icon: Clock3, value: offer.estimated_duration },
    { icon: Users, value: offer.estimated_team_size },
    { icon: Banknote, value: offer.estimated_tjm },
  ].filter(item => item.value != null && item.value !== '')

  if (items.length === 0) return null

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {items.map(({ icon: Icon, value }) => (
          <Badge
            key={String(value)}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--bellum-text-secondary)]"
          >
            <Icon className="size-3.5 shrink-0" />
            {String(value)}
          </Badge>
        ))}
      </div>
      {/* Théo p15 §1 : EJM / durée / staffing sont des ESTIMATIONS Bellum, pas
          des données récupérées — on l'écrit, on ne laisse pas passer un chiffre
          pour un fait. (Édition + profil tarifaire = suite back, non livré ici.) */}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('offers.estimatesLabel')}
      </Text>
    </div>
  )
}

function OfferSheet({ offer, onOpenChange }: { offer: OfferProposal | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('accountDetail')
  return (
    <Sheet open={offer != null} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        className="w-[min(560px,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b border-[var(--bellum-border)] p-5">
          <SheetTitle>{offer?.title ?? t('offers.fallbackTitle')}</SheetTitle>
          <SheetDescription>{t('offers.sheetDescription')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">{offer ? <OfferSheetContent offer={offer} /> : null}</ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function OfferSheetContent({ offer }: { offer: OfferProposal }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div>
      <OfferFacts offer={offer} />
      <div className="divide-y divide-[var(--bellum-border)] px-5">
        <Detail icon={Sparkles} label={t('offers.pitch')} value={offer.pitch} />
        <Detail icon={Target} label={t('offers.painAddressed')} value={offer.pain_addressed} />
        <Detail icon={UserRound} label={t('offers.targetContact')} value={offer.target_contact} />
        <Detail icon={BadgeCheck} label={t('offers.differentiator')} value={offer.differentiator} />
      </div>
    </div>
  )
}

function OfferFacts({ offer }: { offer: OfferProposal }) {
  const { t } = useTranslation('accountDetail')
  const facts = [
    { icon: Clock3, label: t('offers.duration'), value: offer.estimated_duration },
    { icon: Users, label: t('offers.teamSize'), value: offer.estimated_team_size },
    { icon: Banknote, label: t('offers.dailyRate'), value: offer.estimated_tjm },
  ].filter(fact => fact.value != null && fact.value !== '')

  if (facts.length === 0) return null

  return (
    <div className="border-b border-[var(--bellum-border)]">
      <dl className="divide-y divide-[var(--bellum-border)]">
        {facts.map(fact => (
          <OfferFact key={fact.label} {...fact} value={String(fact.value)} />
        ))}
      </dl>
      {/* Même garde-fou que la carte : ces chiffrages sont des estimations Bellum. */}
      <Text size="xs" className="px-5 pb-3 text-[var(--bellum-text-muted)]">
        {t('offers.estimatesLabel')}
      </Text>
    </div>
  )
}

function OfferFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[20px_88px_minmax(0,1fr)] items-start gap-3 px-5 py-3">
      <Icon className="mt-0.5 size-4 text-[var(--bellum-text-muted)]" />
      <dt>
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0">
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
          {value}
        </Text>
      </dd>
    </div>
  )
}

function Detail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <section className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-5">
      <div className="flex size-8 items-center justify-center rounded-md bg-[var(--bellum-surface-2)]">
        <Icon className="size-4 text-[var(--bellum-text-secondary)]" />
      </div>
      <div className="min-w-0">
        <Text element="h3" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
        <Text size="sm" className="mt-1.5 leading-relaxed text-[var(--bellum-text-primary)]">
          {value}
        </Text>
      </div>
    </section>
  )
}
