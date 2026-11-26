import { Text } from '@bellum/ui'
import { ListChecks, Network, Zap, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Kicker } from '@/features/landing/Kicker'
import { Link } from '@/i18n/navigation'

type Screen = {
  icon: LucideIcon
  path: string
}

/** Icon + path stay in the component; title/desc come from the `beta` namespace, zipped by index. */
const SCREENS: Screen[] = [
  { icon: Zap, path: 'app.bellum-ai.com/compte/signaux' },
  { icon: Network, path: 'app.bellum-ai.com/compte/organigramme' },
  { icon: ListChecks, path: 'app.bellum-ai.com/compte/plan-action' },
]

function PlaceholderScreen({ screen, title, badge }: { screen: Screen; title: string; badge: string }) {
  const Icon = screen.icon
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-[linear-gradient(180deg,#10101f,#0a0a14)] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)]">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <span className="flex gap-1.5">
          <i className="size-2.5 rounded-full bg-[#2a2a3a]" />
          <i className="size-2.5 rounded-full bg-[#2a2a3a]" />
          <i className="size-2.5 rounded-full bg-[#2a2a3a]" />
        </span>
        <span className="ml-1 inline-flex flex-1 items-center gap-2 truncate rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-xs text-[#5e5e74]">
          {screen.path}
        </span>
      </div>

      {/* Placeholder body — intentionally not a real screenshot */}
      <div className="relative flex min-h-[188px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.4] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:26px_26px]"
        />
        <span className="relative grid size-12 place-items-center rounded-xl border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.22),rgba(123,97,255,0.05))] text-violet-200">
          <Icon size={22} />
        </span>
        <Text element="div" weight="medium" color="text-white" className="relative text-base">
          {title}
        </Text>
        <span className="relative inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
          <span className="size-1.5 rounded-full bg-violet-400" />
          {badge}
        </span>
      </div>
    </div>
  )
}

export function BetaScreens() {
  const t = useTranslations('beta')
  const items = t.raw('screens.items') as { title: string; desc: string }[]
  const badge = t('screens.badge')

  return (
    <section className="py-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('screens.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('screens.title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-xl leading-relaxed">
            {t('screens.subtitle')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 md:grid-cols-3">
          {SCREENS.map((screen, i) => (
            <div key={screen.path} className="flex flex-col gap-4">
              <PlaceholderScreen screen={screen} title={items[i]?.title ?? ''} badge={badge} />
              <Text element="p" size="sm" color="text-zinc-400" className="px-1 leading-relaxed">
                {items[i]?.desc}
              </Text>
            </div>
          ))}
        </div>

        <Text className="mt-8 text-center text-sm text-zinc-500">
          {t('screens.footerPrefix')}{' '}
          <Link href="/demo" className="font-medium text-violet-300 transition-colors hover:text-violet-200">
            {t('screens.footerLink')}
          </Link>
          {t('screens.footerSuffix')}
        </Text>
      </div>
    </section>
  )
}
