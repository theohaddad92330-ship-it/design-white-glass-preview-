import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useConsultants } from '@/features/consultants/hooks'
import { usePipeline } from '@/features/projects/hooks/usePipeline'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { formatCents } from '@/lib/money'
import { useSession } from '@/lib/hooks/use-session'
import { dealsToAdvance, followedProfiles, pipeTile, type PipeTile } from '../lib/day-portfolio'

/**
 * LE PORTEFEUILLE DE « TA JOURNÉE » — Louis 23/10 : l'écran Théo reste, et ce que la vue jour de PR11 portait
 * en plus revient DANS SA FORME (carte `.v18-card`, tuile `.v18-tile`) : la tuile « Affaires en cours », « Les
 * affaires à faire avancer » (colonne principale, sous les modes rapides) et « Les profils suivis » (colonne de
 * droite) — les trois sont dans la maquette `today-jour`.
 *
 * Chaque bloc lit SA source et se tait tant qu'elle n'a pas répondu : une absence ne fait aucun bloc, et « pas
 * encore lu » n'est jamais « 0 » (GA-18).
 */

const TILE =
  'flex min-h-11 min-w-0 flex-col items-start gap-1.5 rounded-card border border-[var(--bellum-border)] bg-card px-4 py-3.5 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]'

const ROW =
  'flex min-h-11 flex-col gap-0.5 rounded-lg border border-[var(--bellum-border)] px-3 py-2 hover:bg-[var(--bellum-surface-2)]'

/**
 * Théo A today-jour.N2 — « Affaires en cours » : la lecture de MON pipe, `null` tant qu'il n'a pas répondu. Lue par la
 * page AVANT ses retours anticipés (l'ordre des hooks ne change pas au premier chargement qui aboutit).
 */
export function useTodayPipe(): PipeTile | null {
  const pipe = pipeTile(usePipeline('own').data)
  return pipe.kind === 'unknown' ? null : pipe
}

/**
 * Théo A today-jour.N2 — la tuile « Affaires en cours » : somme NON pondérée de MES affaires ; elle mène au pipe. Pipe
 * pas encore lu : aucune tuile (une absence ne fait aucune tuile, comme ses voisines de `today-tiles.ts`).
 */
export function TodayPipeTile({ pipe }: { pipe: PipeTile }) {
  const { t } = useTranslation('briefing')
  return (
    <Link to="/projects" className={TILE}>
      <Text element="span" size="xs" className="flex items-center gap-1 text-[var(--bellum-text-secondary)]">
        {t('day.tiles.pipe.label')}
        <ChevronRight className="size-3" aria-hidden="true" />
      </Text>
      {pipe.kind === 'measured' ? (
        <>
          <Text element="span" size="3xl" weight="semibold" className="tabular-nums leading-none">
            {formatCents(pipe.cents)}
          </Text>
          <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('day.tiles.pipe.detail', { count: pipe.count })}
            {pipe.withoutAmount > 0 ? ` · ${t('day.tiles.pipe.withoutAmount', { count: pipe.withoutAmount })}` : ''}
          </Text>
        </>
      ) : pipe.kind === 'unmeasured' ? (
        <>
          <UnknownValue />
          <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('day.tiles.pipe.unmeasured', { count: pipe.count })}
          </Text>
        </>
      ) : (
        <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('day.tiles.pipe.none')}
        </Text>
      )}
    </Link>
  )
}

/** La carte de Théo (`.v18-card`) : titre de niveau 2, un lien « tout voir » à droite. */
function PortfolioCard({ title, all, children }: { title: string; all: ReactNode; children: ReactNode }) {
  return (
    <Box
      as="section"
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-5"
    >
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {title}
        </Text>
        {all}
      </Box>
      {children}
    </Box>
  )
}

const ALL_LINK =
  'flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]'

/**
 * Théo A today-jour.R8 — « Les affaires à faire avancer » : quatre de MES affaires ouvertes, celles sans prochaine
 * action d'abord. Un montant non saisi se DIT (« montant non saisi »), jamais 0 € (GA-18).
 */
export function TodayDealsCard() {
  const { t } = useTranslation('briefing')
  const { user } = useSession()
  const projects = useProjects()
  if (!user || !projects.data) return null
  const deals = dealsToAdvance(projects.data, user.id)
  if (deals.length === 0) return null

  return (
    <PortfolioCard
      title={t('day.deals.title')}
      all={
        <Link to="/projects" className={ALL_LINK}>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          {t('day.deals.all')}
        </Link>
      }
    >
      <ul className="flex flex-col gap-2">
        {deals.map(deal => (
          <li key={deal.id}>
            <Link to="/projects/$id" params={{ id: deal.id }} className={ROW}>
              <Text size="sm" weight="medium">
                {deal.label}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {[
                  deal.company_name,
                  typeof deal.amount_cents === 'number'
                    ? formatCents(deal.amount_cents, deal.currency ?? 'EUR')
                    : t('day.deals.withoutAmount'),
                  deal.owner_name ? t('day.deals.owner', { name: deal.owner_name }) : null,
                  deal.next_action === null ? t('day.deals.noNextAction') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Link>
          </li>
        ))}
      </ul>
    </PortfolioCard>
  )
}

function formatDay(value: string, language: string): string | null {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed)
}

/**
 * Théo A today-jour.N6 — « Les profils suivis » : trois de MES profils, leurs compétences et la disponibilité
 * DÉCLARÉE (ce que la personne a dit, jamais une disponibilité calculée). Pas de date = pas de ligne.
 */
export function TodayFollowedProfiles() {
  const { t, i18n } = useTranslation('briefing')
  const { user } = useSession()
  const consultants = useConsultants()
  if (!user || !consultants.data) return null
  const profiles = followedProfiles(consultants.data, user.id)
  if (profiles.length === 0) return null

  return (
    <PortfolioCard
      title={t('day.profiles.title')}
      all={
        <Link to="/consultants" className={ALL_LINK}>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          {t('day.profiles.all')}
        </Link>
      }
    >
      <ul className="flex flex-col gap-2">
        {profiles.map(profile => {
          const day = profile.available_from ? formatDay(profile.available_from, i18n.language) : null
          return (
            <li key={profile.id}>
              <Link to="/consultants/$id" params={{ id: profile.id }} className={ROW}>
                <Text size="sm" weight="medium">
                  {profile.full_name ?? profile.title ?? ''}
                </Text>
                {profile.stack.length ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {profile.stack.slice(0, 3).join(' · ')}
                  </Text>
                ) : null}
                {day ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('day.profiles.availability', { date: day })}
                  </Text>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </PortfolioCard>
  )
}
