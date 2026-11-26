import { useTranslation } from 'react-i18next'
import type { AuditHypothesis } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'
import { ConfidenceBadge } from './ConfidenceBadge'

/**
 * #2010.10 — RELIRE LES HYPOTHÈSES, dans `/settings/profile/audit`.
 *
 * Le registre demandait un bloc dédié pour « relire les hypothèses » de
 * l'audit, distinct des recommandations (`AuditDecisionColumns`) et des
 * premiers mouvements (`AuditFirstMoves`). Il DÉRIVE `auditHypothesesFrom()`
 * (`@bellum/contracts`) sur les MÊMES contradictions que ces deux blocs —
 * aucune requête de plus, aucune source de plus.
 *
 * Chaque hypothèse porte sa règle (traçabilité), son texte — nommé comme une
 * hypothèse, jamais comme un fait — et la question qui la vérifierait quand
 * la rupture en nomme une. Une hypothèse SANS question n'est pas cachée :
 * elle se lit juste sans ligne « à vérifier » en dessous (#2064.16 : `null`
 * = non mesuré, jamais « aucune »).
 */
export function AuditHypotheses({ hypotheses }: { hypotheses: readonly AuditHypothesis[] }) {
  const { t } = useTranslation('commercialAudit')

  return (
    <AuditCard className="space-y-3">
      <div className="space-y-1">
        <Text
          element="h2"
          size="xs"
          weight="semibold"
          className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
        >
          {t('hypotheses.title')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('hypotheses.intro')}
        </Text>
      </div>

      {hypotheses.length === 0 ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('hypotheses.unmeasured')}
        </Text>
      ) : (
        <ul className="space-y-3">
          {hypotheses.map(item => (
            <li
              key={item.ruleId}
              data-testid="audit-hypothesis"
              className="space-y-1.5 rounded-lg border border-[var(--bellum-border)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Text element="span" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                  {t(`tensions.rule.${item.ruleId}.label`)}
                </Text>
                <ConfidenceBadge confidence={item.confidence} />
              </div>

              <Text element="p" size="sm">
                {item.hypothesis}
              </Text>

              {item.questionToValidate === null ? null : (
                <Text
                  element="p"
                  size="xs"
                  data-testid="audit-hypothesis-question"
                  className="text-[var(--bellum-text-muted)]"
                >
                  {t('hypotheses.question')} : {item.questionToValidate}
                </Text>
              )}
            </li>
          ))}
        </ul>
      )}
    </AuditCard>
  )
}
