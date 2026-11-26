import type { CriticalRisk } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'

/**
 * LES RISQUES CRITIQUES AGRÉGÉS (#3256, BEL-SC-227.19).
 *
 * Pas un score de plus : seulement les comptes où au moins DEUX signaux déjà
 * calculés ailleurs (impayé, renouvellement non engagé, exigence d'AO non
 * couverte) convergent. Chaque signal a déjà SA carte individuelle plus loin
 * dans le brief ; ce bloc dit uniquement où ils se cumulent sur le MÊME
 * compte — l'exemple du ticket est « deux missions du même compte en fin de
 * contrat la même semaine ».
 *
 * ⚠️ Une liste vide se lit « rien ne converge », et c'est vrai dans les deux
 * cas où elle survient — aucune collision, ou aucun signal du tout. Comme
 * `ChainBlockersBlock`, ce n'est PAS un `0` : GA-18/GA-19 interdisent
 * d'afficher une mesure là où on n'a qu'une absence.
 */
export function CriticalRisksBlock({ risks }: { risks: readonly CriticalRisk[] | undefined }) {
  const { t } = useTranslation('briefing')

  if (!risks || risks.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('criticalRisks.empty')}
      </Text>
    )
  }

  return (
    <Box className="flex flex-col gap-2">
      {risks.map(risk => (
        <Box
          key={risk.accountId}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
        >
          <ObjectMention
            kind="account"
            id={risk.accountId}
            name={risk.companyName}
            attribute={t('criticalRisks.signalsCount', { count: risk.count })}
            className="min-w-0 flex-1 justify-between"
          />
          <Text element="span" size="xs" color="text-muted-foreground" className="shrink-0">
            {[...new Set(risk.kinds)].map(kind => t(`criticalRisks.kind.${kind}`)).join(' · ')}
          </Text>
        </Box>
      ))}
    </Box>
  )
}
