import { cn } from '@bellum/ui'
import {
  BarChart3,
  Briefcase,
  Check,
  FolderOpen,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Network,
  PlusCircle,
  Search,
  Star,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

type SideItem = { icon: LucideIcon; key: string; active?: boolean }

const DOSSIER: SideItem[] = [
  { icon: LayoutGrid, key: 'overview', active: true },
  { icon: Zap, key: 'buySignals' },
  { icon: Users, key: 'decisionMakers' },
  { icon: Network, key: 'orgchart' },
]

const ACTION: SideItem[] = [
  { icon: ListChecks, key: 'actionPlan' },
  { icon: MessageSquare, key: 'messages' },
]

type LectureTag = { icon: LucideIcon; label: string; ok?: boolean }

const LECTURE_META: { icon: LucideIcon; key: string; ok?: boolean }[] = [
  { icon: Check, key: 'highOpportunity', ok: true },
  { icon: PlusCircle, key: 'strategicAlignment' },
  { icon: FolderOpen, key: 'multiLevel' },
]

/** `deltaKey` renvoie aux messages ; `delta` est une variation chiffrée, pas un score. */
type Metric = {
  icon: LucideIcon
  tint: string
  key: string
  value: string
  delta?: string
  deltaKey?: string
  amber?: boolean
}

const METRICS: Metric[] = [
  { icon: Briefcase, tint: 'bg-violet-500/[0.14] text-[#9b85ff]', key: 'offers', value: '26', delta: '↑ 18 %' },
  { icon: Users, tint: 'bg-[#4d9dff]/[0.14] text-[#4d9dff]', key: 'contacts', value: '37', delta: '↑ 12 %' },
  { icon: BarChart3, tint: 'bg-[#36e6a0]/[0.14] text-[#36e6a0]', key: 'entities', value: '8', delta: '↑ 14 %' },
  {
    // « Score ≥ 75 » disait un seuil sur un score que personne ne voyait, et le
    // disait en français en dur. Le produit ne note pas un site sur 100 : il
    // rend `fits` / `below` / `unknown`. On dit donc ce qu'on sait faire.
    icon: Star,
    tint: 'bg-[#e6a23c]/[0.14] text-[#e6a23c]',
    key: 'sites',
    deltaKey: 'sitesDelta',
    value: '42',
    amber: true,
  },
]

function SideRow({ item, label }: { item: SideItem; label: string }) {
  const Icon = item.icon
  return (
    <span
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs',
        item.active ? 'bg-neutral-950 text-white' : 'text-[#b8b8cc]',
      )}
    >
      <Icon size={15} className={item.active ? 'text-[#9b85ff]' : 'text-[#8a8aa0]'} />
      {label}
    </span>
  )
}

type AppMockupProps = {
  className?: string
  tabs?: [string, string, string]
  companyTags?: string[]
  lectureTags?: LectureTag[]
}

/**
 * The BellumAI app screen mockup used as the hero illustration on the
 * landing and product pages (account dossier · SNCF Réseau).
 *
 * ⚠️ L'angle du dossier portait un anneau « 8,5 /10 · GO » : un score sans
 * aucun de ses axes, sur un écran vu par tous les visiteurs. Un score
 * décomposé ne tient pas dans un coin de 68 px — on n'y montre donc plus de
 * score du tout, seulement la lecture qualitative. Le score complet, avec ses
 * cinq axes et ce qui n'a pas pu être évalué, est celui du héros
 * (`DashboardMockup`). Montrer un chiffre là où on ne peut pas montrer ses
 * axes, c'est publier un score nu — c'est le défaut, pas une contrainte de
 * place.
 */
export function AppMockup({ className, tabs, companyTags, lectureTags }: AppMockupProps) {
  const t = useTranslations('common.appMockup')
  const tScore = useTranslations('common.score')
  const resolvedTabs = tabs ?? [t('tabs.overview'), t('tabs.contacts'), t('tabs.orgchart')]
  const resolvedCompanyTags = companyTags ?? [t('tags.rail'), t('tags.siren')]
  const resolvedLectureTags: LectureTag[] =
    lectureTags ?? LECTURE_META.map(m => ({ icon: m.icon, label: t(`reading.${m.key}`), ok: m.ok }))

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/[0.14] bg-[linear-gradient(180deg,#10101f,#0a0a14)] shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)]',
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex gap-1.5">
          <i className="size-2.5 rounded-full bg-[#2a2a3a]" />
          <i className="size-2.5 rounded-full bg-[#2a2a3a]" />
          <i className="size-2.5 rounded-full bg-[#2a2a3a]" />
        </span>
        <span className="ml-1 inline-flex max-w-[230px] flex-1 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-xs text-[#5e5e74]">
          <Search size={13} />
          {t('searchPlaceholder')}
        </span>
        {/* Un écran d'illustration doit se PRÉSENTER comme tel : les chiffres
            qu'il porte n'appartiennent à aucun compte réel. */}
        <span className="rounded border border-white/[0.12] px-1.5 py-0.5 text-xs text-[#5e5e74]">
          {tScore('sample')}
        </span>
        <span className="ml-auto hidden gap-1.5 sm:flex">
          {resolvedTabs.map((tab, i) => (
            <span
              key={tab}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs',
                i === 0 ? 'border-violet-500/40 bg-violet-500/[0.16] text-white' : 'border-white/[0.08] text-[#8a8aa0]',
              )}
            >
              {tab}
            </span>
          ))}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[184px_1fr]">
        <aside className="hidden flex-col gap-0.5  p-3 sm:flex">
          <span className="px-2.5 py-1.5 text-xs uppercase tracking-[0.12em] text-[#5e5e74]">
            {t('sidebar.dossierHeading')}
          </span>
          {DOSSIER.map(item => (
            <SideRow key={item.key} item={item} label={t(`sidebar.${item.key}`)} />
          ))}
          <span className="px-2.5 pb-1.5 pt-3 text-xs uppercase tracking-[0.12em] text-[#5e5e74]">
            {t('sidebar.actionHeading')}
          </span>
          {ACTION.map(item => (
            <SideRow key={item.key} item={item} label={t(`sidebar.${item.key}`)} />
          ))}
        </aside>

        <div className="flex flex-col border border-zinc-800 bg-[--bg-glass] p-4 space-y-4 rounded-xl m-4 overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-white text-xs font-bold tracking-tight text-[#1a1a2e]">
                SNCF
              </span>
              <div>
                <div className="text-base font-medium text-white">SNCF Réseau</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {resolvedCompanyTags.map(tag => (
                    <span
                      key={tag}
                      className="rounded-md border border-white/[0.08] bg-white/[0.045] px-2 py-0.5 text-xs text-[#b8b8cc]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-md border border-[rgba(54,230,160,0.3)] bg-[rgba(54,230,160,0.08)] px-2 py-0.5 text-xs text-[#36e6a0]">
              {t('priorityHigh')}
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.1em] text-[#9b85ff]">
              <span className="grid size-4 place-items-center rounded-full border border-violet-500/40">
                <Zap size={9} />
              </span>
              {t('reading.label')}
            </div>
            <div className="text-lg font-medium text-white">{t('reading.title')}</div>
            <p className="mt-1 text-xs text-[#8a8aa0]">{t('reading.desc')}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {resolvedLectureTags.map(tag => {
                const Icon = tag.icon
                return (
                  <span
                    key={tag.label}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                      tag.ok
                        ? 'border-[rgba(54,230,160,0.3)] bg-[rgba(54,230,160,0.08)] text-[#36e6a0]'
                        : 'border-white/[0.08] bg-white/[0.03] text-[#b8b8cc]',
                    )}
                  >
                    <Icon size={12} />
                    {tag.label}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {METRICS.map(m => {
              const Icon = m.icon
              return (
                <div key={m.key} className="rounded-[10px] border border-white/[0.08] bg-white/[0.022] p-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('grid size-6 place-items-center rounded-md', m.tint)}>
                      <Icon size={13} />
                    </span>
                    <span className="truncate text-xs text-[#8a8aa0]">{t(`metrics.${m.key}`)}</span>
                  </div>
                  <div className="mt-2 text-xl font-semibold leading-none text-white">{m.value}</div>
                  <div className={cn('mt-1.5 font-mono text-xs', m.amber ? 'text-[#e6a23c]' : 'text-[#36e6a0]')}>
                    {m.deltaKey ? t(`metrics.${m.deltaKey}`) : m.delta}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
