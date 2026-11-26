import type { OpenNeedRow } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { missionsAssignedOf } from '../model/need-staffing'

/**
 * #4270.4 (19/10) — en espace « forfait / conseil », un besoin GAGNÉ devient un PROJET suivi, pas une mission à
 * staffer : le bandeau « Staffing & pipeline » cède la place à cette carte. Libellés « projet », aucune demande
 * de staffing proposée. Le compte relit `missionsAssignedOf` (aucun second calcul, GA-26) ; un compte non lu se
 * NOMME, jamais « 0 projet » (GA-18 / GA-19). L'espace régie ne monte pas cette carte : sa fiche est inchangée.
 */
export function NeedWonProjectCard({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const projects = missionsAssignedOf(need)
  return (
    <Card className="p-4">
      <Text element="h2" size="sm" weight="semibold">
        {t('needSheet.wonProject.title')}
      </Text>
      <div className="mt-2 text-sm text-[var(--bellum-text-primary)]">
        {projects.measured ? (
          t('needSheet.wonProject.tracked', { count: projects.count })
        ) : (
          <UnknownValue reason={t('needSheet.wonProject.unread')} />
        )}
      </div>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1.5">
        {t('needSheet.wonProject.noStaffing')}
      </Text>
    </Card>
  )
}
