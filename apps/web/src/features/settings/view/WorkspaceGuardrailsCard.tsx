import { Box, Text } from '@bellum/ui'
import { ShieldCheck } from 'lucide-react'
import { SettingsBlock } from '../components/SettingsBlocks'
import { useTranslation } from 'react-i18next'

const GUARDRAILS = ['noSend', 'noProtectedCriterion', 'humanCorrectionWins'] as const

/**
 * Les garde-fous non négociables de l'espace — EN LECTURE (maquette `settings-espace`, onglet Qualité).
 *
 * Ce que Laura et l'équipe ne font jamais, quel que soit le réglage. Aucun interrupteur, à dessein : ces trois
 * lignes énoncent la doctrine du produit (le copilote n'envoie jamais ; aucun critère protégé ne pèse dans le
 * rang d'une personne ; une correction humaine gagne toujours). Les rendre éditables en ferait des préférences.
 */
export function WorkspaceGuardrailsCard() {
  const { t } = useTranslation('settingsHub')
  return (
    <SettingsBlock title={t('guardrails.title')} description={t('guardrails.subtitle')} testId="guardrails-block">
      {/* `.bo11-checks` : une ligne par garde-fou, l'icône d'accent, le titre, la phrase — en lecture. */}
      <ul className="flex flex-col">
        {GUARDRAILS.map(key => (
          <li
            key={key}
            className="flex items-start gap-2.5 border-b border-[var(--bellum-border)] py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
            <Box className="min-w-0">
              <Text element="p" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {t(`guardrails.${key}.title`)}
              </Text>
              <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                {t(`guardrails.${key}.description`)}
              </Text>
            </Box>
          </li>
        ))}
      </ul>
    </SettingsBlock>
  )
}
