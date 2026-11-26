import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { CommercialAuditContext } from '@bellum/contracts'
import { AuditMaturityAxes } from '@/features/commercial-audit/components/AuditMaturityAxes'

/**
 * Ta maturité commerciale, DANS le profil (décision Louis 22/10/2026 : « la maturité détaillée vit ici, dans Profil,
 * avec ses axes et l'axe non évaluable nommé »). C'est le MÊME composant et le MÊME calcul que l'audit
 * (`AuditMaturityAxes` / `useCommercialAudit`) — aucune seconde dérivation (GA-26). Tant que la lecture n'a pas
 * répondu, le bloc est ABSENT : jamais un score vide ni « 0 ».
 */
export function ProfileMaturitySection({ maturity }: { maturity: CommercialAuditContext['maturity'] }) {
  const { t } = useTranslation('profile')
  return (
    <section className="space-y-3" aria-label={t('framing.maturity.title')}>
      <div className="space-y-1">
        <Text element="h2" size="sm" weight="semibold">
          {t('framing.maturity.title')}
        </Text>
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('framing.maturity.subtitle')}
        </Text>
      </div>
      <AuditMaturityAxes maturity={maturity} />
    </section>
  )
}
