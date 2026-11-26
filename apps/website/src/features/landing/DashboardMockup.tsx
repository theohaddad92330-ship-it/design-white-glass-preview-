import { cn } from '@bellum/ui'
import { Check, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppMockup } from '@/components/AppMockup'
import { ACCOUNT_SCORE_ILLUSTRATION } from '@/lib/score-illustration'

const CONTACTS = [
  { initials: 'CL', grad: 'from-[#7b61ff] to-[#5b3fe0]', name: 'Claire Lefèvre', prio: 'P1', tone: 'p1' },
  { initials: 'TM', grad: 'from-[#4d9dff] to-[#2b6fd4]', name: 'Thomas Mercier', prio: 'P2', tone: 'p2' },
  { initials: 'AR', grad: 'from-[#36e6a0] to-[#1f9e6e]', name: 'Awa Réau', prio: 'P1', tone: 'p1' },
] as const

const PRIO: Record<'p1' | 'p2', string> = {
  p1: 'border-violet-500/30 bg-violet-500/[0.14] text-[#9b85ff]',
  p2: 'border-blue-500/30 bg-blue-500/[0.12] text-[#4d9dff]',
}

/**
 * Le score du héros, DÉCOMPOSÉ.
 *
 * Il affichait « 87 / 100 · Fort potentiel » : un chiffre sans ses axes, et un
 * qualificatif de potentiel collé au chiffre — c'est-à-dire la lecture
 * probabiliste que le produit refuse. Il montre maintenant ce que le produit
 * montre vraiment : cinq axes, quatre notés, et le cinquième NOMMÉ comme non
 * évaluable, sorti du dénominateur (17 sur 20, pas 17 sur 25).
 */
function AccountScoreCard() {
  const t = useTranslations('common.score')
  const tHome = useTranslations('home.dashboard')
  const score = ACCOUNT_SCORE_ILLUSTRATION

  return (
    <div className="absolute -left-10 top-8 hidden w-[248px] animate-float-3 rounded-[15px] border border-white/[0.16] bg-[linear-gradient(180deg,rgba(22,22,38,0.95),rgba(14,14,24,0.95))] p-4 shadow-[0_40px_80px_-28px_rgba(0,0,0,0.9)] backdrop-blur-[16px] lg:block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs tracking-[0.06em] text-[#8a8aa0]">{tHome('opportunityScore')}</span>
        <span className="shrink-0 rounded border border-white/[0.12] px-1.5 py-0.5 text-xs text-[#8a8aa0]">
          {t('sample')}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-white">{score.points}</span>
        <span className="text-xs text-[#8a8aa0]">{t('outOf', { max: score.outOf })}</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {score.axes.map(axis => (
          <div key={axis.key} className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-[#b8b8cc]">{t(`accountAxes.${axis.key}`)}</span>
            {axis.evaluated ? (
              <span
                className="flex shrink-0 gap-0.5"
                role="img"
                aria-label={t('axisValue', { points: axis.points, max: axis.max })}
              >
                {Array.from({ length: axis.max }, (_, step) => (
                  <i
                    key={step}
                    className={cn('block size-1.5 rounded-full', step < axis.points ? 'bg-[#36e6a0]' : 'bg-white/15')}
                  />
                ))}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-[#8a8aa0]">{t('notEvaluated')}</span>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-snug text-[#8a8aa0]">{t('accountNotEvaluatedReason')}</p>
    </div>
  )
}

export function DashboardMockup() {
  const t = useTranslations('home.dashboard')
  const tabs = t.raw('tabs') as [string, string, string]
  const companyTags = t.raw('companyTags') as string[]
  const contactRoles = t.raw('contacts') as { role: string }[]

  return (
    <div className="group relative mx-auto max-w-[720px] [perspective:2000px]">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[70%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(123,97,255,0.45),rgba(77,157,255,0.18)_55%,transparent_78%)] blur-[38px]" />

      <AppMockup
        tabs={tabs}
        companyTags={companyTags}
        className="transition-transform duration-700 ease-out lg:origin-left lg:[transform:rotateY(-15deg)_rotateX(6deg)_rotateZ(1deg)] lg:group-hover:[transform:rotateY(-9deg)_rotateX(4deg)]"
      />

      {/* Floating: buy signal */}
      <div className="absolute -left-6 -top-5 hidden animate-float items-center gap-2.5 rounded-[13px] border border-white/[0.16] bg-[rgba(16,16,30,0.85)] p-2.5 shadow-[0_24px_50px_-18px_rgba(0,0,0,0.85)] backdrop-blur-[16px] lg:flex">
        <span className="grid size-8 place-items-center rounded-[9px] border border-violet-500/40 bg-violet-500/[0.18] text-[#9b85ff]">
          <Zap size={16} />
        </span>
        <span>
          <span className="block text-xs font-medium text-white">{t('buySignalTitle')}</span>
          <span className="text-xs text-[#8a8aa0]">{t('buySignalSub')}</span>
        </span>
      </div>

      {/* Floating: enriched contact */}
      <div className="absolute -bottom-5 right-[8%] hidden animate-float-2 items-center gap-2.5 rounded-[13px] border border-white/[0.16] bg-[rgba(16,16,30,0.85)] p-2.5 shadow-[0_24px_50px_-18px_rgba(0,0,0,0.85)] backdrop-blur-[16px] lg:flex">
        <span className="grid size-8 place-items-center rounded-[9px] border border-[rgba(54,230,160,0.38)] bg-[rgba(54,230,160,0.16)] text-[#36e6a0]">
          <Check size={16} />
        </span>
        <span>
          <span className="block text-xs font-medium text-white">{t('enrichedTitle')}</span>
          <span className="text-xs text-[#8a8aa0]">{t('enrichedSub')}</span>
        </span>
      </div>

      {/* Floating: priority contacts */}
      <div className="absolute -bottom-6 -left-6 hidden w-[230px] animate-float-3 rounded-[15px] border border-white/[0.16] bg-[linear-gradient(180deg,rgba(22,22,38,0.95),rgba(14,14,24,0.95))] p-4 shadow-[0_40px_80px_-28px_rgba(0,0,0,0.9)] backdrop-blur-[16px] lg:block">
        <div className="mb-3 text-xs tracking-[0.06em] text-[#8a8aa0]">{t('priorityContacts')}</div>
        <div className="flex flex-col gap-2.5">
          {CONTACTS.map((contact, i) => (
            <div key={contact.initials} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xs font-semibold text-white',
                  contact.grad,
                )}
              >
                {contact.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-white">{contact.name}</span>
                <span className="text-xs text-[#8a8aa0]">{contactRoles[i]?.role}</span>
              </span>
              <span className={cn('rounded border px-1.5 py-0.5 font-mono text-xs', PRIO[contact.tone])}>
                {contact.prio}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating: opportunity score — décomposé, jamais nu */}
      <AccountScoreCard />
    </div>
  )
}
