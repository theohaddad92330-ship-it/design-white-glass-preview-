import { Box, Text } from '@bellum/ui'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Le bandeau de transparence (PDF 4 §7.2, AI Act art. 50 et 86).
 *
 * NON MASQUABLE : pas de croix, pas de « ne plus afficher », pas de repli. Ce
 * n'est pas une préférence d'interface — classer des candidats relève de
 * l'annexe III, et la personne devant l'écran doit savoir en permanence qu'un
 * système automatisé a produit ce classement.
 *
 * Il est monté en tête du panneau et non en pied : un bandeau qu'il faut
 * dérouler pour voir n'informe personne.
 */
export function TransparencyBanner() {
  const { t } = useTranslation('matching')
  return (
    <Box
      display="flex"
      className="items-start gap-2 border-b border-border bg-[var(--bellum-surface-2)] px-5 py-3"
      role="note"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('transparency')}
      </Text>
    </Box>
  )
}
