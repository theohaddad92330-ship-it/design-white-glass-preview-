import type { Account } from '@bellum/contracts'
import { Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { buildEvaluationViewData } from '../account-detail/tabs/evaluation/evaluationViewData'
import { reconcileFactorsWithDossierRead } from '../account-detail/tabs/evaluation/scoreFactors'
import type { AccountRow } from './types'

/** La ligne entière ouvre le dossier : un clic sur la pastille (ou dans son panneau) ne doit pas le faire aussi. */
function stopRowClick(event: MouseEvent<HTMLElement>) {
  event.stopPropagation()
}

/**
 * Le score que la ligne montre : le /25 de la fiche quand le dossier en porte un, sinon le /10 — la MÊME règle
 * que la jauge de la fiche (`ScoreSummaryCard`, GA-26). `null` = aucun score : la cellule ne dessine rien.
 */
export function interestScoreOf(row: Pick<AccountRow, 'priority_score' | 'score_25'>): {
  value: number
  max: 25 | 10
} | null {
  if (row.score_25 != null) return { value: row.score_25, max: 25 }
  if (row.priority_score != null) return { value: row.priority_score, max: 10 }
  return null
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
}

/**
 * #4497 (PR 12C, maquette V22 `.a4-score-pill`) — LA COLONNE « INTÉRÊT », gardée avec ses axes (Louis 23/10).
 *
 * Un score n'est jamais nu : la pastille porte son échelle (« 18/25 »), et un clic ouvre ses axes — chacun avec
 * sa note sur son maximum —, puis ceux qui n'ont pas pu être évalués, NOMMÉS, hors du dénominateur. Les axes
 * se lisent dans le dossier du compte (`GET /accounts/:id`, la requête que la fiche fait déjà, partagée par son
 * cache), à l'ouverture seulement : vingt-cinq lignes ne paient pas vingt-cinq lectures. Ni probabilité, ni
 * pourcentage.
 */
export function AccountInterestCell({ row }: { row: AccountRow }) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)
  const score = interestScoreOf(row)
  if (!score || row.status === 'analyzing') return null
  const shown = formatScore(score.value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stopRowClick}
          data-testid="account-interest"
          aria-label={t('interest.aria', { value: shown, max: score.max })}
          className="inline-flex min-h-8 items-baseline gap-1.5 rounded-badge border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-xs text-[var(--bellum-text-secondary)] transition-colors duration-immediate ease-bellum-out hover:border-[color-mix(in_srgb,var(--bellum-text-accent)_40%,var(--bellum-border))] pointer-coarse:min-h-11"
        >
          {/* Le score et son échelle en UN texte : « 18/25 » ne se lit jamais « 18 » nu. */}
          <span className="text-sm font-semibold tabular-nums text-[var(--bellum-text-primary)]">
            {`${shown}/${score.max}`}
          </span>
          <span>{t('interest.label')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" onClick={stopRowClick}>
        {open ? <InterestAxes accountId={row.id} companyName={row.company_name} /> : null}
      </PopoverContent>
    </Popover>
  )
}

function InterestAxes({ accountId, companyName }: { accountId: string; companyName: string }) {
  const { t } = useTranslation('accounts')
  const query = useQuery<Account>({
    queryKey: accountKeys.detail(accountId),
    queryFn: () => accountsApi.getOne(accountId),
  })
  const view = query.data ? buildEvaluationViewData(query.data) : null
  const factors = view
    ? reconcileFactorsWithDossierRead(view.scoreFactors, view.dossierRead?.score.unknownAxes ?? []).filter(
        factor => factor.kind === 'axis',
      )
    : []
  const measured = factors.filter(factor => factor.weight !== null)
  const excluded = factors.filter(factor => factor.weight === null).map(factor => factor.label)
  return (
    <div className="flex flex-col gap-2" data-testid="account-interest-axes">
      <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('interest.title', { company: companyName })}
      </Text>
      {query.isLoading ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('interest.loading')}
        </Text>
      ) : query.isError ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('interest.failed')}
        </Text>
      ) : factors.length === 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('interest.noAxes')}
        </Text>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {measured.map(factor => (
              <li key={factor.label} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 text-[var(--bellum-text-secondary)]">{factor.label}</span>
                <span className="shrink-0 tabular-nums text-[var(--bellum-text-primary)]">
                  {factor.max != null ? `${factor.weight}/${factor.max}` : factor.weight}
                </span>
              </li>
            ))}
          </ul>
          {excluded.length > 0 ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="account-interest-excluded">
              {t('interest.excluded', { axes: excluded.join(', ') })}
            </Text>
          ) : null}
        </>
      )}
      <Link
        to="/accounts/$id"
        params={{ id: accountId }}
        className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[var(--bellum-text-accent)] hover:underline md:min-h-0"
      >
        {t('interest.open')}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  )
}
