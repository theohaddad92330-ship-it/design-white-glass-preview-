import { type AccountVerdict, namedAccountVerdict } from '@bellum/contracts'
import { Button, Logo, Text } from '@bellum/ui'
import { AlertTriangle, Loader2, Sparkles, Trophy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { accountsApi } from '@/features/accounts/api'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import type { CompareData, CompareItem } from '@/features/accounts/battlecard-compare.types'
import type { AccountRow } from './types'

/** Max accounts the IA prioritisation accepts (keeps the prompt / LLM cost bounded). */
const AI_COMPARE_MAX = 5

/**
 * AI prioritisation layered under the free static comparison table. One click
 * calls `/ia/compare` (proxied to the IA) and renders the recommended order,
 * per-account verdict and the "quick win". Present-only — the reasoning is built
 * from the accounts' own analyses, never invented.
 */
export function CompareAiSection({ accounts }: { accounts: AccountRow[] }) {
  const { t } = useTranslation('accounts')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [data, setData] = useState<CompareData | null>(null)

  const picked = accounts.slice(0, AI_COMPARE_MAX)
  const truncated = accounts.length > AI_COMPARE_MAX

  const run = async () => {
    if (loading) return
    setLoading(true)
    setError(false)
    try {
      const res = await accountsApi.compareAI(picked.map(a => a.id))
      if (!res?.success) throw new Error('comparison failed')
      setData(res.data ?? {})
    } catch (err) {
      console.error('[CompareAI]', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Logo className="size-4 text-[var(--bellum-text-accent)]" />
          <Text element="h3" size="sm" weight="semibold" className="text-[var(--text-primary)]">
            {t('compare.ai.title')}
          </Text>
        </div>
        <Button variant="violet" size="sm" icon={Sparkles} isLoading={loading} onClick={run}>
          {data ? t('compare.ai.regenerate') : t('compare.ai.generate')}
        </Button>
      </div>

      {/* Transparence coût : génération par IA sur les données collectées. */}
      <Text size="xs" className="mt-1.5 text-[var(--text-ghost)]">
        {t('compare.ai.aiNote')}
        {truncated ? ` ${t('compare.ai.truncated', { count: AI_COMPARE_MAX })}` : ''}
      </Text>

      {error ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-[var(--danger-soft-text)]">
          <AlertTriangle className="h-4 w-4" />
          {t('compare.ai.error')}
        </div>
      ) : loading ? (
        <div className="mt-4 flex items-center justify-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--bellum-text-accent)]" />
          {t('compare.ai.generating')}
        </div>
      ) : data ? (
        <CompareAiResult data={data} />
      ) : (
        <Text size="sm" className="mt-3 text-[var(--text-secondary)]">
          {t('compare.ai.hint')}
        </Text>
      )}
    </div>
  )
}

function CompareAiResult({ data }: { data: CompareData }) {
  const { t } = useTranslation('accounts')
  const comparison = data.comparison ?? []
  const order = data.priority_order ?? []

  return (
    <div className="mt-4 space-y-4">
      {/* #2284.1 — résoudre avant de comparer : deux comptes, une même entreprise.
          On le DIT, on ne fusionne jamais (le geste reste au commercial). */}
      {(data.identity_overlaps ?? []).map(overlap => (
        <div
          key={overlap.account_ids.join('|')}
          data-testid="compare-identity-overlap"
          className="flex items-start gap-2 rounded-lg border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
          <p className="text-sm text-[color:var(--text-primary)]">
            {t('compare.ai.sameEntity', {
              companies: overlap.companies.filter((name): name is string => Boolean(name)).join(' · '),
              siren: overlap.siren,
            })}
          </p>
        </div>
      ))}
      {data.quick_win ? (
        <div className="flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--bellum-text-accent)]">
              {t('compare.ai.quickWin')}
            </p>
            <p className="text-sm text-[color:var(--text-primary)]">{data.quick_win}</p>
          </div>
        </div>
      ) : null}

      {order.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-ghost)]">
            {t('compare.ai.priorityOrder')}
          </p>
          <ol className="flex flex-wrap gap-2">
            {order.map((name, i) => (
              <li
                key={`${name}-${i}`}
                className="flex items-center gap-1.5 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
              >
                <span className="font-semibold tabular-nums text-[var(--bellum-text-accent)]">{i + 1}</span>
                {name}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {comparison.length > 0 ? (
        <div className="space-y-2">
          {comparison.map((item, i) => (
            <CompareAiRow key={`${item.company ?? 'x'}-${i}`} item={item} />
          ))}
        </div>
      ) : null}

      {data.reasoning ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-ghost)]">
            {t('compare.ai.reasoning')}
          </p>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{data.reasoning}</p>
        </div>
      ) : null}
    </div>
  )
}

// La grille du prompt IA (`bellum_compare.py`) contraint `recommendation` à
// GO | NO-GO | PRUDENT | GO RAPIDE — un vocabulaire fermé, pas un texte libre.
function verdictFamilyFromRecommendation(rec?: string): AccountVerdict | null {
  const r = (rec ?? '').toUpperCase()
  if (r.includes('NO-GO') || r.includes('NO GO')) return 'NO-GO'
  if (r.includes('PRUDENT')) return 'PRUDENT'
  if (r.includes('GO')) return 'GO'
  return null
}

function recommendationColor(rec?: string): string {
  switch (verdictFamilyFromRecommendation(rec)) {
    case 'NO-GO':
      return 'var(--bellum-danger)'
    case 'PRUDENT':
      return 'var(--bellum-warning)'
    case 'GO':
      return 'var(--bellum-success)'
    default:
      return 'var(--text-ghost)'
  }
}

// #2932 (constat recette 27/09/2026, salle démo) — le MÊME nom métier que la
// fiche compte (`AccountVerdictSummary.tsx`), pas le libellé brut de l'IA
// (`namedAccountVerdict`, GA-26). Cette liste n'a pas le déclencheur NO-GO
// par compte (`dossier_read.no_go.trigger`) : `hasNoGoTrigger` reste `false`,
// comme `getRecommendation` (`types.ts`). Un libellé hors du vocabulaire
// attendu se réaffiche tel quel — jamais un mot inventé.
function namedRecommendation(rec: string, hasObjective: boolean): string {
  const family = verdictFamilyFromRecommendation(rec)
  // #3818 — sans objectif renseigné, jamais « ÉCARTER POUR CET OBJECTIF ».
  return family ? namedAccountVerdict(family, false, { hasObjective }) : rec
}

function CompareAiRow({ item }: { item: CompareItem }) {
  const { t } = useTranslation('accounts')
  const hasObjective = useHasOfferObjective()
  const color = recommendationColor(item.recommendation)
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[color:var(--text-primary)]">{item.company}</p>
        <div className="flex items-center gap-2">
          {typeof item.adjusted_score === 'number' ? (
            <span className="text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
              {item.adjusted_score}
            </span>
          ) : null}
          {item.recommendation ? (
            <span
              className="inline-block rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide"
              style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}
            >
              {namedRecommendation(item.recommendation, hasObjective)}
            </span>
          ) : null}
        </div>
      </div>
      {(item.strengths?.length ?? 0) > 0 ? (
        <p className="mt-1.5 text-xs text-[var(--success-soft-text)]">
          {t('compare.ai.strengths', { value: (item.strengths ?? []).join(' · ') })}
        </p>
      ) : null}
      {(item.risks?.length ?? 0) > 0 ? (
        <p className="mt-0.5 text-xs text-[var(--danger-soft-text)]">
          {t('compare.ai.risks', { value: (item.risks ?? []).join(' · ') })}
        </p>
      ) : null}
      {item.estimated_cycle || item.key_contact ? (
        <p className="mt-0.5 text-xs text-[var(--text-ghost)]">
          {[
            item.estimated_cycle ? t('compare.ai.cycle', { value: item.estimated_cycle }) : null,
            item.key_contact ? t('compare.ai.keyContact', { value: item.key_contact }) : null,
          ]
            .filter(Boolean)
            .join(' — ')}
        </p>
      ) : null}
    </div>
  )
}
