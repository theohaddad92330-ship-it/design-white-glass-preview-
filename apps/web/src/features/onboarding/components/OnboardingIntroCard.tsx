import { useTranslation } from 'react-i18next'
import { Card, CardContent, Text } from '@bellum/ui'
import { ONBOARDING_ESTIMATED_MINUTES } from '@/features/onboarding/lib/onboarding-gate'
import { TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'

/**
 * #2013.3 — LA DURÉE ANNONCÉE VIENT D'UN SEUL ENDROIT.
 *
 * Cette carte promettait « 11 questions, moins de 2 minutes » : deux nombres
 * saisis à la main, tous les deux faux (neuf sous-étapes, et l'issue annonce
 * huit à douze minutes). Les deux se dérivent désormais — la fourchette de
 * {@link ONBOARDING_ESTIMATED_MINUTES}, que la page 0 affiche aussi, et le
 * nombre d'étapes du questionnaire réel. Un écran qui recopie un nombre finit
 * par contredire son voisin.
 */
export function OnboardingIntroCard() {
  const { t } = useTranslation('onboarding')
  return (
    <Card className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
      <CardContent className="space-y-2 p-5">
        <Text element="h2" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('intro.title')}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-primary)]">
          {t('intro.description', {
            steps: TEMPS1_SUBSTEPS.length,
            min: ONBOARDING_ESTIMATED_MINUTES.min,
            max: ONBOARDING_ESTIMATED_MINUTES.max,
          })}
        </Text>
      </CardContent>
    </Card>
  )
}
