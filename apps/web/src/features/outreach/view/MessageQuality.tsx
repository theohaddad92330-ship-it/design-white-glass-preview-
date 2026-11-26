import { MESSAGE_QUALITY_CRITERIA, scoreMessageQuality, type MessageQualityInput } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Lot L-C (#4166) — LE SCORE DE QUALITÉ, à côté de l'étape.
 *
 * Calculé SUR PLACE dans le navigateur (`scoreMessageQuality`, pur) : le texte
 * ne part nulle part. Il NOMME les critères — « 5 critères tenus sur 6 » puis
 * « à revoir : plus de 120 mots » — jamais une note nue, jamais une probabilité
 * de réponse. Un texte vide n'a pas de score (« non évalué », jamais 0).
 */
export function MessageQuality(props: MessageQualityInput) {
  const { t } = useTranslation('outreach')
  const score = scoreMessageQuality(props)
  if (!score.evaluated) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="message-quality">
        {t('playbooks.quality.notEvaluated')}
      </Text>
    )
  }
  const total = MESSAGE_QUALITY_CRITERIA.length - score.notEvaluable.length
  return (
    <Box className="flex flex-col gap-1" data-testid="message-quality">
      <Text size="xs" weight="medium">
        {t('playbooks.quality.label')} — {t('playbooks.quality.summary', { ok: score.passed.length, total })}
      </Text>
      {score.failed.length === 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('playbooks.quality.allOk')}
        </Text>
      ) : (
        <Text size="xs" className="text-[var(--warning-soft-text)]">
          {t('playbooks.quality.toFix', {
            list: score.failed.map(criterion => t(`playbooks.quality.criteria.${criterion}`)).join(' · '),
          })}
        </Text>
      )}
      {score.jargon.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('playbooks.quality.jargonFound', { list: score.jargon.join(', ') })}
        </Text>
      ) : null}
      {score.notEvaluable.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('playbooks.quality.notApplicable', {
            list: score.notEvaluable.map(criterion => t(`playbooks.quality.criteriaOk.${criterion}`)).join(' · '),
          })}
        </Text>
      ) : null}
    </Box>
  )
}
