import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { PropagatedBlock } from '@/features/propagation/PropagatedBlock'
import { useConsultantMargin } from '@/features/propagation/hooks'

/**
 * LA MARGE MOYENNE D'UN CONSULTANT (§4.2 et §4.3), SUR SA FICHE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CINQ ÉTATS, ET AUCUN NE S'ÉCRIT « 0 % »
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce bloc dit cinq choses différentes, qui envoient chercher la réponse à cinq
 * endroits opposés. Les replier sur un même vide — ou pire, sur un zéro — est
 * exactement ce que D45 a corrigé côté serveur :
 *
 *  1. **403 / marge rédigée** — la marge décrit l'ÉQUIPE et reste sous
 *     `finance:read` SEUL : un consultant n'a pas de propriétaire commercial, et
 *     lui en inventer un pour les besoins d'un filtre produirait une marge
 *     fausse. ⚠️ `recruiter` est justement le rôle qui ouvre cette fiche, et il
 *     n'a AUCUN droit financier — ce n'est pas un cas théorique.
 *  2. **échec de lecture** — « cassé » ne se lit pas « pas de marge ».
 *  3. **non mesurable** — moins de cinq missions dans le calcul. L'écran ne se
 *     tait pas (un écran muet fait chercher une panne) et n'affiche pas non plus
 *     un pourcentage calculé sur deux missions avec l'autorité d'une moyenne :
 *     il dit combien il en manque.
 *  4. **mesurable, mais aucun terme** — aucune mission ne porte à la fois un
 *     tarif, un coût chargé et des jours déclarés.
 *  5. **mesurée** — le pourcentage, négatif compris. Un consultant à perte doit
 *     se voir : c'est exactement l'information cherchée.
 *
 * ⚠️ Ce qui SORT du calcul est COMPTÉ et nommé (`unmeasured`) : une mission dont
 * un terme manque n'est pas fondue dans la moyenne, et ne disparaît pas non plus.
 *
 * ⚠️ §4.4 — le pourcentage mène aux missions de ce consultant, et ne s'édite pas
 * ici. Le coût chargé se saisit sur LA MISSION, à la main et à dessein : un coût
 * moyen appliqué à tout le monde produirait une marge fausse, plus dangereuse
 * qu'une marge absente.
 */
export function TalentMarginCard({ talentId }: { talentId: string }) {
  const { t } = useTranslation('consultants')
  const { margin, denied, failed, canReadFinance } = useConsultantMargin(talentId)

  return (
    <Card className="p-4">
      <Text size="sm" weight="semibold">
        {t('propagation.marginTitle')}
      </Text>
      <MarginLine margin={margin} denied={denied} failed={failed} canReadFinance={canReadFinance} />
    </Card>
  )
}

function MarginLine({
  margin,
  denied,
  failed,
  canReadFinance,
}: {
  margin: ReturnType<typeof useConsultantMargin>['margin']
  denied: boolean
  failed: boolean
  canReadFinance: boolean
}) {
  const { t } = useTranslation('consultants')

  // 403 (aucun droit) et `finance:read:own` (marge d'équipe rédigée) mènent à la
  // MÊME phrase, parce que c'est la même vérité : ce n'est pas ton périmètre.
  // Ce qui compte est de ne jamais la confondre avec « non mesuré ».
  if (denied || !canReadFinance) return <Muted>{t('propagation.marginDenied')}</Muted>
  if (failed) return <Muted>{t('propagation.marginFailed')}</Muted>
  // Aucune ligne : ce consultant n'a jamais été affecté à une mission.
  if (!margin) return <Muted>{t('propagation.marginNoData')}</Muted>

  if (!margin.measurability.measurable) {
    return (
      <Muted>
        {t('propagation.marginUnmeasurable', {
          observed: margin.measurability.observed,
          required: margin.measurability.required,
        })}
      </Muted>
    )
  }
  if (margin.marginPercent === null) return <Muted>{t('propagation.marginNoData')}</Muted>

  return (
    <>
      <Text size="sm" className="mt-1">
        <PropagatedBlock source={margin.source}>
          {t('propagation.margin', { percent: Math.round(margin.marginPercent) })}
        </PropagatedBlock>
      </Text>
      <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {t('propagation.marginHint')}
        {margin.unmeasured > 0 ? ` ${t('propagation.marginUnmeasured', { count: margin.unmeasured })}.` : ''}
      </Text>
    </>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
      {children}
    </Text>
  )
}
