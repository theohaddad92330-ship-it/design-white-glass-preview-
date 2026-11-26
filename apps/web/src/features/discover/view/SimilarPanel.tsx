import { creditCostOf } from '@bellum/contracts'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Users } from 'lucide-react'
import { useSimilarAccountsToExplore } from '@/features/accounts/hooks/useSimilarAccountsToExplore'
import { DISCOVER_SUGGESTION_PREFIX } from '@/features/discover/lib/discover-analyze'
import { DiscoverError, DiscoverLoading } from './DiscoverStates'
import { describeSimilarProximity } from '@/features/accounts/model/similarProximity'
import { SimilarAxesText } from '@/features/accounts/view/SimilarAxesText'

/**
 * Mode « Similaires » — amorcé par le portefeuille du commercial via
 * `GET /accounts/similar-to-explore`, qui existait déjà et n'était exposé
 * nulle part sur cet écran.
 *
 * Ces suggestions ne sont PAS des candidats registre : elles n'ont ni SIREN ni
 * score calculé. Elles sont donc rendues dans un format volontairement plus
 * pauvre que `CandidateCard` — pas de score, pas de puces factuelles — plutôt
 * que déguisées en résultat de registre.
 */
export function SimilarPanel() {
  const { t } = useTranslation('discover')
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useSimilarAccountsToExplore()

  if (isLoading) return <DiscoverLoading />
  if (isError) return <DiscoverError onRetry={() => refetch()} />

  const suggestions = data ?? []

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div
          className="mb-4 flex h-[64px] w-[64px] items-center justify-center rounded-2xl"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <Users className="h-9 w-[36px]" style={{ color: 'var(--text-ghost)' }} />
        </div>
        <p className="text-base font-bold text-[color:var(--text-primary)]">{t('similar.empty')}</p>
        <p className="mt-1 max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('similar.emptyHint')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        {t('similar.description')}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {suggestions.map(suggestion => (
          <div
            key={suggestion.id}
            className="flex flex-col rounded-xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold leading-tight text-[color:var(--text-primary)]">
                {suggestion.company_name}
              </h3>
              {/* Un score n'est JAMAIS nu. « Proximité 43 % » est un chiffre
                  exact et une lecture fausse : il se lit « à moitié proche »
                  alors qu'il dit « un critère de ton profil sur trois ». On
                  affiche donc le NIVEAU, et le pourcentage reste en infobulle
                  pour qui veut le détail. Même correction que l'organigramme
                  majoritairement déduit. */}
              {typeof suggestion.score_similarity === 'number' && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  title={t('similar.similarity', { percent: Math.round(suggestion.score_similarity * 100) })}
                >
                  {t(
                    describeSimilarProximity(suggestion.score_similarity) === 'strong'
                      ? 'similar.proximityStrong'
                      : 'similar.proximityPartial',
                  )}
                </span>
              )}
            </div>

            <p className="mb-2 text-xs" style={{ color: 'var(--text-ghost)' }}>
              {suggestion.sector}
            </p>
            {/* #2040.18 — LES AXES, NOMMÉS. Le niveau ci-dessus ne voyage jamais
                seul : ce qui rapproche ce compte de ton profil, et ce que le
                questionnaire ne permet pas encore de juger. Sans score (moins de
                trois axes renseignés), le panneau ne se tait pas pour autant —
                il dit quels axes manquent. Même ligne, même dérivation que la
                carte de compte (`SimilarAxesText`, GA-26). */}
            <SimilarAxesText
              reasons={suggestion.similarity_reasons}
              unevaluated={suggestion.similarity_unevaluated}
              className="mb-2 text-[var(--bellum-text-muted)]"
            />
            <p className="mb-4 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {suggestion.description}
            </p>

            <button
              type="button"
              onClick={() =>
                navigate({
                  to: '/search',
                  search: {
                    company: suggestion.company_name,
                    suggestionId: `${DISCOVER_SUGGESTION_PREFIX}similar:${suggestion.id}`,
                    suggestionReason: suggestion.description,
                  },
                })
              }
              className="mt-auto flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--violet-500)', color: 'var(--bellum-on-primary)' }}
            >
              {t('similar.explore')}
              <ArrowRight className="h-[13px] w-[13px]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
