import { Card, Text } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CheckIcon } from '@/components/ui/check'
import { Link } from '@/i18n/navigation'
import { Kicker } from './Kicker'

type Persona = {
  badge: string
  title: string
  points: readonly string[]
}

function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <Card className="flex flex-col gap-4 rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-6 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40">
      <span className="w-fit rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1">
        <Text element="span" size="xs" weight="semibold" color="text-violet-300">
          {persona.badge}
        </Text>
      </span>
      <Text element="h3" size="xl" weight="bold" color="text-white">
        {persona.title}
      </Text>
      <ul className="space-y-2.5">
        {persona.points.map(point => (
          <li key={point} className="flex items-start gap-2">
            <CheckIcon size={15} className="mt-0.5 shrink-0 text-emerald-400" />
            <Text element="span" size="sm" color="text-zinc-300">
              {point}
            </Text>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function UseCasesPreview() {
  const t = useTranslations('home.useCases')
  const personas = t.raw('personas') as Persona[]

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
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-md leading-relaxed">
            {t('paragraph')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 md:grid-cols-3">
          {personas.map(persona => (
            <PersonaCard key={persona.badge} persona={persona} />
          ))}
        </div>

        <div className="mt-10 animate-fade-up text-center">
          <Link
            href="/use-cases"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
          >
            {t('cta')}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
