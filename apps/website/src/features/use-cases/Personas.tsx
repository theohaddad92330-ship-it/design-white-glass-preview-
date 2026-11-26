import { Card, Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { CheckIcon } from '@/components/ui/check'

type Persona = {
  badge: string
  title: string
  points: readonly string[]
}

function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <Card className="group flex flex-col gap-4 rounded-2xl bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] transition-[opacity,transform] duration-[800ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] hover:-translate-y-1 sm:p-10 p-6">
      <span className="w-fit rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 transition-colors duration-500 group-hover:border-violet-500/55 group-hover:bg-violet-500/15">
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

export function Personas() {
  const t = useTranslations('useCases')
  const personas = t.raw('personas.items') as Persona[]

  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-xl animate-fade-up text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5">
            <Text element="span" size="xs" color="text-violet-300">
              {t('personas.badge')}
            </Text>
          </span>
          <Text
            element="h2"
            size="3xl"
            weight="medium"
            color="text-white"
            className="mx-auto max-w-sm mt-4 md:text-4xl"
          >
            {t('personas.title')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up grid-cols-1 gap-4 md:grid-cols-3">
          {personas.map(persona => (
            <PersonaCard key={persona.badge} persona={persona} />
          ))}
        </div>
      </div>
    </section>
  )
}
