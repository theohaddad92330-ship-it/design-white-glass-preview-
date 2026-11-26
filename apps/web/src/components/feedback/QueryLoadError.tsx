import { useTranslation } from 'react-i18next'
import { Box, Text } from '@bellum/ui'

/**
 * #3666.k — une lecture en échec n'est PAS un vide. Une liste dont la requête a
 * échoué rend ceci, jamais son « Aucun … » : l'un rassure à tort, l'autre dit
 * qu'il faut réessayer.
 */
export function QueryLoadError() {
  const { t } = useTranslation('common')
  return (
    <Box role="alert" className="rounded-md border border-dashed border-destructive/40 p-4">
      <Text size="sm" color="text-muted-foreground">
        {t('states.loadError')}
      </Text>
    </Box>
  )
}
