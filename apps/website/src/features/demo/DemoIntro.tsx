import { Text } from '@bellum/ui'
import { Check, Users, Zap, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { signupUrl } from '@/lib/app-url'

/** Icons stay in the component; benefit text comes from the `demo` namespace, zipped by index. */
const BENEFIT_ICONS: LucideIcon[] = [Zap, Users, Check]

export function DemoIntro() {
  const t = useTranslations('demo')
  const benefits = t.raw('intro.benefits') as string[]

  return (
    <div className="animate-fade-up">
      <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5">
        <span className="size-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
        <Text element="span" size="xs" className="text-violet-200">
          {t('intro.badge')}
        </Text>
      </span>

      <Text
        element="h1"
        weight="medium"
        color="text-white"
        leading="tight"
        className="mt-6 text-balance text-3xl lg:text-5xl"
      >
        {t('intro.title')}
      </Text>

      <Text element="p" size="lg" color="text-zinc-400" className="mt-4 max-w-xl leading-relaxed">
        {t('intro.subtitle')}
      </Text>

      <div className="mt-8 flex flex-col gap-4">
        {BENEFIT_ICONS.map((Icon, i) => (
          <div key={benefits[i]} className="flex items-start gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-violet-500/25 bg-violet-500/[0.12] text-violet-300">
              <Icon size={18} />
            </span>
            <Text element="p" color="text-zinc-300" className="leading-relaxed">
              {benefits[i]}
            </Text>
          </div>
        ))}
      </div>

      <Text element="p" size="sm" color="text-zinc-500" className="mt-7">
        {t('intro.explorePrefix')}{' '}
        <a href={signupUrl()} className="font-medium text-violet-300 transition-colors hover:text-violet-200">
          {t('intro.exploreLink')}
        </a>{' '}
        {t('intro.exploreSuffix')}
      </Text>
    </div>
  )
}
