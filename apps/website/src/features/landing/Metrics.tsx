import { Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'

type Metric = {
  value: string
  label: string
  sub: string
}

export function Metrics() {
  const t = useTranslations('home.metrics')
  const metrics = t.raw('items') as Metric[]

  return (
    <section className="py-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid animate-fade-up grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/[0.12] bg-white/[0.06] lg:grid-cols-4">
          {metrics.map(metric => (
            <div
              key={metric.label}
              className="bg-[linear-gradient(180deg,rgba(20,18,30,0.6),rgba(12,10,18,0.6))] p-7 text-center backdrop-blur-[16px] sm:p-9"
            >
              <Text
                element="p"
                weight="bold"
                color="text-white"
                className="text-[clamp(30px,4vw,44px)] leading-none text-gradient-em"
              >
                {metric.value}
              </Text>
              <Text element="p" weight="medium" color="text-white" className="mt-3 text-base leading-snug">
                {metric.label}
              </Text>
              <Text element="p" size="sm" color="text-zinc-500" className="mt-1.5 leading-relaxed">
                {metric.sub}
              </Text>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
