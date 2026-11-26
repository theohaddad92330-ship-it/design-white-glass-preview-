import { Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/**
 * Théo C missions-dossier.N3 — « Après la mission » : où va le consultant ensuite. Front seul, deux
 * renvois : les besoins ouverts et la fiche du talent (pour CONFIRMER sa disponibilité). La date du
 * planning n'est pas la disponibilité annoncée — la phrase le dit, et aucun lien n'écrit l'une à la place
 * de l'autre.
 */
export function MissionAfterBlock({
  consultants,
}: {
  consultants: readonly { consultantId: string; consultantName: string | null }[]
}) {
  const { t } = useTranslation('missions')
  return (
    <Card className="p-4" aria-label={t('after.title')}>
      <Text element="h3" size="base" weight="semibold">
        {t('after.title')}
      </Text>
      <Text element="p" size="sm" color="text-muted-foreground" className="mt-1">
        {t('after.distinct')}
      </Text>
      <Box display="flex" className="mt-3 flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild className="pointer-coarse:min-h-11">
          <Link to="/projects/needs">{t('after.exploreNeeds')}</Link>
        </Button>
        {consultants.map(consultant => (
          <Button key={consultant.consultantId} size="sm" variant="outline" asChild className="pointer-coarse:min-h-11">
            <Link
              to="/consultants/$id"
              params={{ id: consultant.consultantId }}
              aria-label={
                consultant.consultantName
                  ? t('after.confirmAvailabilityFor', { name: consultant.consultantName })
                  : undefined
              }
            >
              {t('after.confirmAvailability')}
            </Link>
          </Button>
        ))}
      </Box>
    </Card>
  )
}
