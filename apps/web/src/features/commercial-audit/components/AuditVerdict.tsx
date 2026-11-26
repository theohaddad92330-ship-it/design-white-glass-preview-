import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'
import { AuditFeedbackControls } from './AuditFeedbackControls'
import { ConfidenceBadge } from './ConfidenceBadge'
import type { AuditVerdict as AuditVerdictValue } from '../lib/audit-verdict'

/**
 * #2090.12 / #2090.13 — LE VERDICT PRINCIPAL, DEUX LIGNES MAXIMUM.
 *
 * `AuditHero` rendait cinq cartes de faits, jamais une phrase qui tranche.
 * Ici, une seule ligne primaire (la rupture ou le goulot le plus significatif
 * — voir `lib/audit-verdict.ts`) et, quand elle existe, sa conséquence. Sans
 * l'une ni l'autre, l'écran le NOMME plutôt que d'écrire un résumé qui ne
 * viendrait de rien.
 */
export function AuditVerdict({ verdict }: { verdict: AuditVerdictValue | null }) {
  const { t } = useTranslation('commercialAudit')

  return (
    <AuditCard className="space-y-2">
      <Text
        element="h2"
        size="xs"
        weight="semibold"
        className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
      >
        {t('verdict.title')}
      </Text>
      {verdict === null ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('verdict.unmeasured')}
        </Text>
      ) : (
        <div className="space-y-1">
          <Text element="p" size="lg" weight="semibold">
            {verdict.primary}
          </Text>
          {verdict.secondary ? (
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {verdict.secondary}
            </Text>
          ) : null}
          <ConfidenceBadge confidence={verdict.confidence} />
          {/* #2075.12 — commenter CETTE conclusion. `target_key: 'verdict'` —
              même clé que celle qui NOMME le verdict dans `unestablished`
              (`build-audit.ts`), jamais un second identifiant inventé. */}
          <AuditFeedbackControls targetKey="verdict" />
        </div>
      )}
    </AuditCard>
  )
}
