import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import type { FocalKnown } from './focalOrgData'

/**
 * #4072.1 — « déjà connu de l'espace » : le contact est dans « ton CRM » et/ou
 * a été l'interlocuteur d'une mission passée. Marqué et DATÉ ; jamais d'où la
 * donnée vient au-delà de ces deux natures. UN composant pour les deux cartes
 * (GA-26). Rien à dire ⇒ rien de rendu.
 */
export function OrgKnownMarker({ known }: { known: FocalKnown | null }) {
  const { t } = useTranslation('accountOrg')
  if (!known || known.reasons.length === 0) return null
  const label = t(
    known.reasons.length > 1 ? 'focal.knownBoth' : known.reasons[0] === 'crm' ? 'focal.knownCrm' : 'focal.knownMission',
  )
  const date = formatDate(known.lastDate)
  return (
    <Text size="xs" className="mt-1 text-[var(--bellum-text-accent)]" data-testid="org-person-known">
      {date ? t('focal.knownDated', { label, date }) : label}
    </Text>
  )
}
