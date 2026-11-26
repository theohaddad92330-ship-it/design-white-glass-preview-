import { Box, Text } from '@bellum/ui'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Théo C automations-* — le guide `.v18-guide` des trois maquettes : un lien d'accent REPLIÉ (un clic, jamais caché)
 * qui déplie trois colonnes — ce qu'est une automatisation, le parcours utile, ce qu'il faut garder en tête. Le même
 * texte sur les trois écrans (liste, bibliothèque, éditeur) : il décrit le métier, pas l'écran.
 *
 * Son libellé n'est PAS « Comment travailler ici ? » : la coque pose déjà ce lien-là (`ScreenGuideLink`, centre
 * d'aide) sous l'en-tête — deux liens du même nom mèneraient à deux endroits.
 */
export function AutomationsGuide() {
  const { t } = useTranslation('routines')
  return (
    <details className="group mb-5 min-w-0 text-sm text-[var(--bellum-text-secondary)]">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 py-1.5 text-xs text-[var(--bellum-text-accent)] pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        {t('guide.summary')}
        <ChevronDown
          className="size-3.5 transition-transform duration-immediate ease-bellum-out group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <Box className="mt-2 grid gap-6 rounded-card border border-[var(--bellum-border)] bg-card p-4 leading-relaxed md:grid-cols-[1fr_1.4fr] md:p-5 xl:grid-cols-[1.1fr_1.5fr_1fr]">
        <Box>
          <Text element="h3" size="sm" weight="semibold" className="mb-1.5 text-[var(--bellum-text-primary)]">
            {t('guide.heading')}
          </Text>
          <Text element="p" size="sm">
            {t('guide.intro')}
          </Text>
        </Box>
        <Box>
          <Text element="h4" size="sm" weight="semibold" className="mb-1.5 text-[var(--bellum-text-primary)]">
            {t('guide.stepsTitle')}
          </Text>
          <ol className="list-decimal space-y-1 pl-4">
            <li>{t('guide.step1')}</li>
            <li>{t('guide.step2')}</li>
            <li>{t('guide.step3')}</li>
          </ol>
        </Box>
        <Box className="md:col-span-2 xl:col-span-1">
          <Text element="h4" size="sm" weight="semibold" className="mb-1.5 text-[var(--bellum-text-primary)]">
            {t('guide.keepTitle')}
          </Text>
          <Text element="p" size="sm">
            {t('guide.keep')}
          </Text>
        </Box>
      </Box>
    </details>
  )
}
