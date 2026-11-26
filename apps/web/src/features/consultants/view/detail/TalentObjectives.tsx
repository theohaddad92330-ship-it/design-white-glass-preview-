import { Box, Button, Text } from '@bellum/ui'
import { Building2, ListChecks } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/**
 * Théo C talents-fiche.N1 — DEUX OBJECTIFS DISTINCTS en tête de fiche : répondre à un besoin connu,
 * ou explorer des comptes compatibles. Aucun des deux ne promet un besoin ni une mission.
 * « Explorer les comptes » mène à la page déjà là (`ReverseMarketPage`) — une seule surface de classement.
 */
export function TalentObjectives({ talentId, onCompareNeeds }: { talentId: string; onCompareNeeds: () => void }) {
  const { t } = useTranslation('consultants')
  return (
    <Box
      display="flex"
      role="group"
      aria-label={t('detail.objectives.aria')}
      className="mt-3 flex-wrap items-center justify-between gap-2"
    >
      <Text size="sm" className="min-w-0 text-[var(--bellum-text-secondary)]">
        {t('detail.objectives.intro')}
      </Text>
      <Box display="flex" className="flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={onCompareNeeds}>
          <ListChecks className="size-4" aria-hidden />
          {t('detail.objectives.compareNeeds')}
        </Button>
        <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5">
          <Link to="/consultants/$id/reverse-market" params={{ id: talentId }}>
            <Building2 className="size-4" aria-hidden />
            {t('detail.objectives.exploreAccounts')}
          </Link>
        </Button>
      </Box>
    </Box>
  )
}
