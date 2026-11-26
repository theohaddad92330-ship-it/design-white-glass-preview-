import { Card, Text, cn } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Kicker } from './Kicker'

type ContactMeta = {
  initials: string
  avatar: string
  tone: 'p1' | 'p2'
}

type ContactCopy = { name: string; sub: string; action: string }
type CreditCopy = { credit: string; label: string }

const CONTACTS: ContactMeta[] = [
  { initials: 'CL', avatar: 'from-violet-500 to-indigo-700', tone: 'p1' },
  { initials: 'TM', avatar: 'from-blue-400 to-blue-700', tone: 'p2' },
  { initials: 'AR', avatar: 'from-emerald-400 to-emerald-700', tone: 'p1' },
]

const TONE: Record<ContactMeta['tone'], string> = {
  p1: 'border-violet-500/30 bg-violet-500/[0.14] text-violet-300',
  p2: 'border-blue-500/30 bg-blue-500/[0.12] text-blue-300',
}

function ContactRow({ meta, copy }: { meta: ContactMeta; copy: ContactCopy }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.018] p-2.5">
      <span
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white',
          meta.avatar,
        )}
      >
        {meta.initials}
      </span>
      <div className="min-w-0 flex-1">
        <Text element="div" size="xs" weight="medium" color="text-white" className="truncate">
          {copy.name}
        </Text>
        <Text element="div" size="xs" color="text-zinc-500" className="truncate">
          {copy.sub}
        </Text>
      </div>
      <span className={cn('shrink-0 rounded-md border px-2 py-1 text-xs', TONE[meta.tone])}>{copy.action}</span>
    </div>
  )
}

export function Enrichment() {
  const t = useTranslations('home.enrichment')
  const contacts = t.raw('contacts') as ContactCopy[]
  const credits = t.raw('credits') as CreditCopy[]

  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1.15fr_1fr]">
        <Card className="relative order-2 overflow-hidden rounded-3xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 backdrop-blur-[16px] lg:order-1">
          <div className="mb-4 flex items-center justify-between">
            <Text element="span" size="sm" className=" text-zinc-500">
              {t('cardHeader')}
            </Text>
            <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs text-violet-300">
              {t('cardBadge')}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {CONTACTS.map((meta, i) => (
              <ContactRow key={meta.initials} meta={meta} copy={contacts[i]!} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
            <Text element="span" size="sm" color="text-zinc-500">
              {t('creditsEstimated')}
            </Text>
            <Text element="span" size="sm" color="text-white">
              {t('creditsValue')}
            </Text>
          </div>
        </Card>

        <div className="order-1 animate-fade-up lg:order-2">
          <Kicker>{t('kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.4vw,40px)] leading-tight"
          >
            {t('heading')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mt-4 leading-relaxed">
            {t('paragraph')}
          </Text>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {credits.map(item => (
              <div key={item.label} className="rounded-xl border border-white/[0.12] bg-white/[0.04] p-4">
                <Text element="div" size="sm" className=" text-violet-300">
                  {item.credit}
                </Text>
                <Text element="div" size="sm" weight="medium" color="text-white" className="mt-1.5">
                  {item.label}
                </Text>
              </div>
            ))}
          </div>
          <Link
            href="/product"
            className="group mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
          >
            {t('cta')}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
