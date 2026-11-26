import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { NEED_WIZARD_STEPS, type NeedWizardStep } from '../model/need-wizard'

/**
 * Les cinq étapes, nommées, numérotées, ET expliquées — la même lecture que la maquette :
 * « 1 Type de mission — Choisis le type de mission ».
 *
 * Le sous-titre n'est pas décoratif : sans lui, « Matching » et « Confirmation » ne disent pas ce qu'on va y
 * faire, et un assistant dont on ne sait pas où il mène se quitte à la deuxième étape.
 *
 * #4339 (recette 20/10) — les libellés étaient tronqués (« Ty… », « Inf… », « D… ») : cinq colonnes `truncate`
 * dans une boîte étroite. Désormais le libellé PASSE À LA LIGNE (jamais « … »), le numéro est posé au-dessus
 * du libellé dès `md`, et sous `md` l'étape COURANTE garde son libellé entier (« 2 · Informations clés »)
 * pendant que les autres se réduisent à leur numéro.
 */
export function NeedWizardSteps({ current }: { current: NeedWizardStep }) {
  const { t } = useTranslation('projects')
  const labels: Record<NeedWizardStep, string> = {
    1: t('needWizard.steps.type'),
    2: t('needWizard.steps.keyInfo'),
    3: t('needWizard.steps.decision'),
    4: t('needWizard.steps.matching'),
    5: t('needWizard.steps.confirmation'),
  }
  const hints: Record<NeedWizardStep, string> = {
    1: t('needWizard.stepHints.type'),
    2: t('needWizard.stepHints.keyInfo'),
    3: t('needWizard.stepHints.decision'),
    4: t('needWizard.stepHints.matching'),
    5: t('needWizard.stepHints.confirmation'),
  }
  return (
    <ol
      aria-label={t('needWizard.stepsLabel')}
      className="flex min-w-0 gap-2 rounded-md border border-[var(--bellum-border)] p-3 md:gap-3"
    >
      {NEED_WIZARD_STEPS.map(step => (
        <li
          key={step}
          title={`${step} · ${labels[step]}`}
          className={`flex min-w-0 items-start gap-2 md:flex-1 md:flex-col md:items-center md:text-center ${
            step === current ? 'max-md:flex-1' : ''
          }`}
          aria-current={step === current || undefined}
        >
          <Box
            display="flex"
            aria-hidden
            className={`size-7 shrink-0 items-center justify-center rounded-full border text-sm ${
              step === current
                ? 'border-[var(--bellum-text-accent)] text-[var(--bellum-text-accent)]'
                : step < current
                  ? 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-muted)]'
                  : 'border-[var(--bellum-border)] text-[var(--bellum-text-muted)]'
            }`}
          >
            {step}
          </Box>
          <Box className={`min-w-0 ${step === current ? '' : 'max-md:sr-only'}`}>
            <Text
              size="sm"
              weight={step === current ? 'medium' : 'normal'}
              className="block break-words"
              color={step === current ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-secondary)]'}
            >
              {labels[step]}
            </Text>
            <Text size="xs" className="block break-words max-md:hidden" color="text-[var(--bellum-text-muted)]">
              {hints[step]}
            </Text>
          </Box>
        </li>
      ))}
    </ol>
  )
}
