import { Card, Text } from '@bellum/ui'
import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConsultantsKnowingSector } from '@/features/accounts/hooks/useConsultantsKnowingSector'

/**
 * #5017.2 — « consultants qui connaissent ce secteur », sur la fiche compte.
 *
 * Les secteurs lus sont ceux que le CV CITE (#5017.1), jamais déduits. Aucun consultant, chargement, panne ou
 * secteur du compte inconnu ⇒ la carte ne se rend pas : on n'affiche pas ce qu'on n'a pas.
 */
export function ConsultantsKnowSectorCard({ sector }: { sector: string | null | undefined }) {
  const { t } = useTranslation('accounts')
  const { data, isPending, isError } = useConsultantsKnowingSector(sector)
  if (isPending || isError || !data || data.consultants.length === 0) return null
  return (
    <Card className="p-4" data-testid="consultants-know-sector">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold">
          {t('consultantsKnowSector.title', { sector: data.sector })}
        </Text>
      </div>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('consultantsKnowSector.subtitle')}
      </Text>
      <ul className="mt-3 space-y-1.5">
        {data.consultants.map(consultant => (
          <li key={consultant.id} className="flex flex-col">
            <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {consultant.full_name ?? t('consultantsKnowSector.nameUnknown')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('consultantsKnowSector.cited', { sectors: consultant.matched_sectors.join(' · ') })}
            </Text>
          </li>
        ))}
      </ul>
    </Card>
  )
}
