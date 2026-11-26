import { Card, Text } from '@bellum/ui'
import { XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CheckIcon } from '@/components/ui/check'
import { Kicker } from './Kicker'

export function ProblemSection() {
  const t = useTranslations('home.problem')
  const before = t.raw('before') as string[]
  const after = t.raw('after') as string[]

  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-6">
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
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-2xl leading-relaxed">
            {t('paragraph')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-5 md:grid-cols-2">
          <Card className="rounded-3xl border-white/10 bg-white/[0.06] p-8">
            <Text element="div" size="sm" className=" text-zinc-400">
              {t('beforeTitle')}
            </Text>
            <ul className="mt-6 space-y-4">
              {before.map(line => (
                <li key={line} className="flex items-start gap-3">
                  <XCircle size={20} className="mt-0.5 shrink-0 text-zinc-500" />

                  <Text element="span" size="sm" color="text-zinc-400" className="leading-relaxed">
                    {line}
                  </Text>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="animate-sheen group relative overflow-hidden rounded-3xl border-[rgba(54,230,160,0.18)] bg-white/[0.06] bg-[linear-gradient(180deg,rgba(54,230,160,0.06),rgba(123,97,255,0.04))] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(54,230,160,0.32)]">
            <div className="pointer-events-none absolute -right-[60px] -top-[60px] h-[200px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(54,230,160,0.28),transparent_70%)] blur-[70px] opacity-40" />
            <Text element="div" size="sm" className="relative text-violet-300">
              {t('afterTitle')}
            </Text>
            <ul className="relative mt-6 space-y-4">
              {after.map(line => (
                <li key={line} className="flex items-start gap-3">
                  <CheckIcon size={20} className="mt-0.5 shrink-0 text-emerald-400" />
                  <Text element="span" size="sm" color="text-zinc-200" className="leading-relaxed">
                    {line}
                  </Text>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </section>
  )
}
