import {
  CASE_BUYING_MODELS,
  CASE_ORGANISATIONS,
  CASE_STRATEGIES,
  type CaseBuyingModel,
  type CaseOrganisation,
  type CaseStrategy,
} from '@bellum/contracts'
import { Box, SelectField, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useProjectCaseDimensions, useSaveProjectCaseDimensions } from '../hooks/useProjectCaseDimensions'

/**
 * #3246 — stratégie d'approche, modèle d'achat et organisation de la décision
 * d'une perte DÉJÀ clôturée.
 *
 * Seul le geste de clôture les écrivait : une perte clôturée avant ces lots
 * restait hors de la comparaison de Laura entre cas. Trois listes FERMÉES,
 * un choix = une écriture de ce seul champ ; « Non renseigné » efface.
 * Lecture en erreur → aucun formulaire, mais le titre et une phrase : on n'affiche pas ce qu'on n'a pas,
 * et on ne disparaît pas sans le dire.
 */
export function LostDealCaseDimensions({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')
  const { data, isError } = useProjectCaseDimensions(projectId)
  const { mutate, isPending, isError: saveFailed } = useSaveProjectCaseDimensions()

  // R17 15/10 — le bloc ne disparaît plus en silence : lecture en erreur ou en cours, il garde
  // son titre et DIT l'état (aucune valeur devinée, aucun formulaire).
  if (isError || !data) {
    return (
      <Box className="space-y-2" data-anchor="project-case-dimensions">
        <Text size="sm" weight="medium">
          {t('detail.caseDimensions.title')}
        </Text>
        <Text size="xs" color="text-muted-foreground" data-testid="case-dimensions-unavailable">
          {isError ? t('detail.caseDimensions.unavailable') : t('detail.caseDimensions.loading')}
        </Text>
      </Box>
    )
  }

  return (
    <Box className="space-y-2" data-anchor="project-case-dimensions">
      <Text size="sm" weight="medium">
        {t('detail.caseDimensions.title')}
      </Text>
      <Text size="xs" color="text-muted-foreground">
        {t('detail.caseDimensions.hint')}
      </Text>
      <Box className="grid gap-2 sm:grid-cols-2">
        <SelectField
          ariaLabel={t('detail.caseDimensions.strategy')}
          value={data.strategy ?? ''}
          disabled={isPending}
          onChange={next =>
            mutate({ id: projectId, patch: { strategy: CASE_STRATEGIES.find(c => c === next) ?? null } })
          }
          placeholder={t('detail.caseDimensions.strategy')}
          emptyOption={{ label: t('stageMove.choiceNone') }}
          options={CASE_STRATEGIES.map((code: CaseStrategy) => ({
            value: code,
            label: t(`stageMove.strategies.${code}`),
          }))}
        />
        <SelectField
          ariaLabel={t('detail.caseDimensions.buyingModel')}
          value={data.buying_model ?? ''}
          disabled={isPending}
          onChange={next =>
            mutate({ id: projectId, patch: { buying_model: CASE_BUYING_MODELS.find(c => c === next) ?? null } })
          }
          placeholder={t('detail.caseDimensions.buyingModel')}
          emptyOption={{ label: t('stageMove.choiceNone') }}
          options={CASE_BUYING_MODELS.map((code: CaseBuyingModel) => ({
            value: code,
            label: t(`stageMove.buyingModels.${code}`),
          }))}
        />
        <SelectField
          ariaLabel={t('detail.caseDimensions.organisation')}
          value={data.organisation ?? ''}
          disabled={isPending}
          onChange={next =>
            mutate({ id: projectId, patch: { organisation: CASE_ORGANISATIONS.find(c => c === next) ?? null } })
          }
          placeholder={t('detail.caseDimensions.organisation')}
          emptyOption={{ label: t('stageMove.choiceNone') }}
          options={CASE_ORGANISATIONS.map((code: CaseOrganisation) => ({
            value: code,
            label: t(`stageMove.organisations.${code}`),
          }))}
        />
      </Box>
      {saveFailed ? (
        <Text size="xs" color="text-muted-foreground" role="alert">
          {t('detail.caseDimensions.saveError')}
        </Text>
      ) : null}
    </Box>
  )
}
