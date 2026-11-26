import { relationStatusOf } from '@bellum/contracts'
import { Text, cn } from '@bellum/ui'
import { capitalize, compactSector } from '@bellum/utils'
import { Link } from '@tanstack/react-router'
import { ArrowRight, CalendarClock, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { formatSignalDateIfKnown } from '@/lib/signal-date'
import { headquartersCity } from '../account-detail/tabs/synthesis/accountSynthesis'
import { useSetAccountFavorite } from '@/features/accounts/hooks/useSetAccountFavorite'
import { accountFavoriteLabelKey } from './accountRowActions'
import { AccountPeopleCell } from './AccountPeopleCell'
import { nextActionText } from './AccountRowCells'
import { TEAM_DECISION_LABEL_KEY, TEAM_DECISION_TONE, teamDecisionOf } from './teamDecision'
import type { AccountRow } from './types'

/**
 * #4497 (V22) — les deux lignes de contexte sous le sujet : des FAITS du compte, jamais une phrase rédigée ici
 * (celle de Laura vit dans la fiche). D'où vient le sujet et quand (source et date du signal), puis la
 * dernière action tracée. Un fait absent ne fait pas de ligne ; aucun fait → aucun bloc.
 */
function contextLinesOf(row: AccountRow, t: (key: string, options?: Record<string, unknown>) => string): string[] {
  const source = row.signal_preview?.source?.trim() || null
  const date = formatSignalDateIfKnown(row.signal_preview?.date ?? null)
  const signalLine = source && date ? `${source} · ${date}` : (source ?? date)
  const lastAction = formatSignalDateIfKnown(row.last_action_at ?? null)
  return [signalLine, lastAction ? t('resume.contextLastAction', { date: lastAction }) : null].filter(
    (line): line is string => Boolean(line),
  )
}

/**
 * Refonte Théo (comptes-liste, `.a4-account-card`) — LA CARTE D'UN COMPTE, écrite une fois et rendue deux
 * fois : l'étagère « Reprendre le fil » et la vue « Cartes » du portefeuille (GA-26).
 *
 * De haut en bas, comme la maquette : logo, secteur (et la décision de l'équipe, EN MOTS), étoile ; le nom
 * en titre ; le sujet (le signal dominant, son libellé réel) ; les visages + le nombre de contacts et la
 * RELATION ; puis, filet au-dessus, la prochaine action écrite. Rien n'est rédigé ici : la phrase de Laura
 * que Théo met sous le sujet vit dans la fiche, et une carte sans action prévue n'a pas de dernière ligne.
 */
export function AccountPortfolioCard({ row, focus = false }: { row: AccountRow; focus?: boolean }) {
  const { t } = useTranslation('accounts')
  const setFavorite = useSetAccountFavorite()
  const decision = teamDecisionOf(row)
  const relation = relationStatusOf(row.commercial_status)
  const subject = row.signal_preview?.label ?? row.primary_signal ?? null
  const sector = compactSector(row.sector)
  // #4497.a — `.a4-place` : la ville du siège, à côté du secteur ; absente ⇒ aucun texte.
  const place = headquartersCity(row.headquarters)
  const next = row.next_action_label?.trim()
  const context = contextLinesOf(row, t)
  return (
    <li
      data-testid="account-portfolio-card"
      className={cn(
        'flex min-w-0 flex-col rounded-card border px-4 pt-4 transition-colors duration-immediate ease-bellum-out hover:border-[color-mix(in_srgb,var(--bellum-text-accent)_40%,var(--bellum-border))] md:px-5 md:pt-5',
        focus
          ? 'border-[color-mix(in_srgb,var(--bellum-text-accent)_30%,var(--bellum-border))] bg-[color-mix(in_srgb,var(--bellum-text-accent)_7%,var(--bellum-surface-1))]'
          : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]',
      )}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <CompanyAvatar name={row.company_name} size="md" logoUrl={row.logo_url} website={row.website} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {sector ? (
            <span className="truncate rounded-badge bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
              {sector}
            </span>
          ) : null}
          {place ? (
            <span data-testid="account-card-place" className="truncate text-xs text-[var(--bellum-text-secondary)]">
              {place}
            </span>
          ) : null}
          {decision ? (
            <span
              data-testid="team-decision"
              className={cn(
                'inline-flex rounded-badge px-1.5 py-0.5 text-xs font-medium',
                TEAM_DECISION_TONE[decision],
              )}
            >
              {t(TEAM_DECISION_LABEL_KEY[decision])}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-pressed={row.is_favorite === true}
          aria-label={t(accountFavoriteLabelKey(row.is_favorite === true))}
          disabled={setFavorite.isPending}
          onClick={() => setFavorite.mutate({ id: row.id, next: !row.is_favorite })}
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-control"
        >
          <Star
            className={cn(
              'size-4',
              row.is_favorite
                ? 'fill-[var(--bellum-text-accent)] text-[var(--bellum-text-accent)]'
                : 'text-[var(--bellum-text-muted)]',
            )}
            aria-hidden
          />
        </button>
      </div>
      <Link
        to="/accounts/$id"
        params={{ id: row.id }}
        className="flex min-h-11 items-center justify-between gap-3 text-xl font-semibold tracking-tight text-[var(--bellum-text-primary)] hover:text-[var(--bellum-text-accent)] md:min-h-0"
      >
        <span className="line-clamp-2 min-w-0">{capitalize(row.company_name)}</span>
        <ArrowRight className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      </Link>
      {/* V22 `.a4-account-card h3` — le SUJET en titre gras, puis ses deux lignes de contexte. */}
      {subject ? (
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-[var(--bellum-text-primary)]">{subject}</h3>
      ) : null}
      {context.length > 0 ? (
        <ul data-testid="account-card-context" className="mt-1.5 flex flex-col gap-0.5">
          {context.map(line => (
            <li key={line}>
              <Text element="span" size="xs" className="line-clamp-1 text-[var(--bellum-text-secondary)]">
                {line}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pb-4 pt-5">
        <AccountPeopleCell accountId={row.id} people={row.people} variant="card" />
        <span
          data-testid="account-card-relation"
          className={cn(
            'inline-flex rounded-badge px-2 py-0.5 text-xs font-medium',
            relation.primary === 'client'
              ? 'bg-[color-mix(in_srgb,var(--success-soft-text)_14%,transparent)] text-[var(--success-soft-text)]'
              : 'bg-[color-mix(in_srgb,var(--bellum-text-accent)_12%,transparent)] text-[var(--bellum-text-accent)]',
          )}
        >
          {t(`relationStatus.${relation.primary}`)}
        </span>
      </div>
      {next ? (
        <Link
          to="/accounts/$id"
          params={{ id: row.id }}
          data-testid="account-card-next"
          className="-mx-4 flex min-h-11 items-center gap-2 border-t border-[var(--bellum-border)] px-4 py-3 text-xs text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] md:-mx-5 md:px-5"
        >
          <CalendarClock className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{nextActionText(t, next, row.next_action_horizon)}</span>
          <ArrowRight className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
        </Link>
      ) : null}
    </li>
  )
}
