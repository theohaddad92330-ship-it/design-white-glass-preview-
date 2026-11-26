import { Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { TEAM_DECISION_LABEL_KEY, TEAM_DECISION_TONE, teamDecisionOf } from './teamDecision'
import type { AccountRow, Recommendation } from './types'

/**
 * Refonte Théo (comptes-liste) — LA DÉCISION D'ÉQUIPE ET LE VERDICT, EN MOTS.
 *
 * Remplace la note chiffrée (« 16/25 ») : la liste dit ce que l'équipe a décidé (À trancher · Priorisé ·
 * Écarté · En observation) puis le verdict de l'analyse (« Agir maintenant », « Réserve »…). Aucun nombre ;
 * les axes et le détail du score vivent sur la fiche. Les états honnêtes d'avant sont gardés tels quels :
 * analyse en cours (#3666), verdict indisponible avec sa RAISON, palier non arbitré (D10), et le tiret
 * nommé quand rien n'a été évalué.
 */
export function AccountDecisionCell({
  row,
  recommendation,
  className,
}: {
  row: AccountRow
  recommendation: Recommendation
  className?: string
}) {
  const { t } = useTranslation('accounts')
  const decision = teamDecisionOf(row)
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1 text-center', className)}>
      {decision ? (
        <span
          data-testid="team-decision"
          data-decision={decision}
          className={cn(
            'inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
            TEAM_DECISION_TONE[decision],
          )}
        >
          {t(TEAM_DECISION_LABEL_KEY[decision])}
        </span>
      ) : null}
      {row.status === 'analyzing' ? (
        /* #3666 — analyse en cours : le verdict d'une analyse précédente ne se présente pas comme actuel. */
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]" data-testid="score-analyzing">
          {t('list.scoreAnalyzing')}
        </Text>
      ) : row.priority_score != null ? (
        <>
          {recommendation.unavailableReason ? (
            <div className="flex flex-col items-center gap-0.5" data-testid="score-unavailable">
              <Text element="span" size="xs" weight="semibold" color={recommendation.color}>
                {t('list.verdictUnavailable')}
              </Text>
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                {t(`list.verdictUnavailableReason.${recommendation.unavailableReason}`)}
              </Text>
            </div>
          ) : (
            <Text
              element="span"
              size="xs"
              weight="semibold"
              // #4470 — « ÉCARTER POUR CET OBJECTIF » est long : il retourne à la ligne DANS sa cellule
              // (jamais `whitespace-nowrap`, qui le laissait déborder sur la colonne Accessibilité).
              className="min-w-0 max-w-full break-words tracking-wide"
              color={recommendation.color}
              data-testid="account-verdict"
            >
              {recommendation.label}
            </Text>
          )}
          {/* D10 (Louis 05/10) — un palier posé sans arbitrage de l'équipe le dit. */}
          {row.score_unarbitrated === true ? (
            <Text
              element="span"
              size="xs"
              className="whitespace-nowrap text-[var(--bellum-text-muted)]"
              data-testid="score-unarbitrated"
            >
              {t('score.unarbitrated', { ns: 'common' })}
            </Text>
          ) : null}
        </>
      ) : decision ? null : (
        /* Le tiret dit « pas de verdict » à l'œil ; il porte le MÊME nom accessible que l'ancienne pastille. */
        <Text
          element="span"
          size="sm"
          className="text-[var(--bellum-text-muted)]"
          title={t('score.accountUnknown', { ns: 'common' })}
          aria-label={t('score.accountUnknown', { ns: 'common' })}
        >
          -
        </Text>
      )}
    </div>
  )
}
