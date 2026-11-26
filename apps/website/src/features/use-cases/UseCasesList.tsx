import { Card, Text, cn } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { signupUrl } from '@/lib/app-url'

type UseCaseMeta = {
  num: string
  ctaHref: string
  halo?: 'violet' | 'blue'
}

type UseCaseText = {
  title: string
  frustration: string
  solution: string
  ctaLabel: string
}

/** Structural fields stay in the component; text comes from the `useCases` namespace, zipped by index. */
const USE_CASES: UseCaseMeta[] = [
  {
    num: '01',
    ctaHref: signupUrl(),
    halo: 'violet',
  },
  {
    num: '02',
    ctaHref: signupUrl(),
  },
  {
    num: '03',
    ctaHref: signupUrl(),
  },
  {
    num: '04',
    ctaHref: signupUrl(),
  },
  {
    num: '05',
    ctaHref: '/demo',
    halo: 'blue',
  },
]

const CTA_CLASS =
  'group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200'

function UseCaseCard({
  meta,
  text,
  frustrationLabel,
  solutionLabel,
}: {
  meta: UseCaseMeta
  text: UseCaseText
  frustrationLabel: string
  solutionLabel: string
}) {
  return (
    <Card className="relative overflow-hidden rounded-2xl border-white/10 bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] p-7 transition-[opacity,transform] duration-[800ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] sm:p-10">
      {meta.halo && (
        <div
          className={cn('pointer-events-none absolute -right-[8%] -top-[10%] h-[120%] w-2/5 rounded-full blur-[100px]')}
        />
      )}

      <div className="relative grid grid-cols-[auto_1fr] gap-5 sm:gap-6">
        <Text
          element="span"
          size="5xl"
          weight="bold"
          className="leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(139,92,246,0.5)]"
        >
          {meta.num}
        </Text>

        <div>
          <Text element="h2" size="2xl" weight="medium" color="text-white">
            {text.title}
          </Text>

          <Text element="p" size="sm" color="text-zinc-400" className="mt-3 leading-relaxed">
            <span className={cn('text-zinc-500')}>{frustrationLabel}</span>
            {text.frustration}
          </Text>

          <Text element="p" size="sm" color="text-zinc-200" className="mt-3 leading-relaxed">
            <span className={cn('text-violet-300')}>{solutionLabel}</span>
            {text.solution}
          </Text>

          {meta.ctaHref.startsWith('/') ? (
            <Link href={meta.ctaHref} className={CTA_CLASS}>
              {text.ctaLabel}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <a href={meta.ctaHref} className={CTA_CLASS}>
              {text.ctaLabel}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}

export function UseCasesList() {
  const t = useTranslations('useCases')
  const items = t.raw('list.items') as UseCaseText[]
  const frustrationLabel = t('list.frustrationLabel')
  const solutionLabel = t('list.solutionLabel')

  return (
    <section className="py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6">
        {USE_CASES.map((meta, i) => (
          <UseCaseCard
            key={meta.num}
            meta={meta}
            text={items[i]}
            frustrationLabel={frustrationLabel}
            solutionLabel={solutionLabel}
          />
        ))}
      </div>
    </section>
  )
}
