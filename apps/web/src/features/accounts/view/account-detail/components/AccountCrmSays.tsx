import {
  CRM_TOOL_NAMES,
  crmFieldCrmVersion,
  crmFieldSource,
  crmSaysSummary,
  isCrmSaysEmpty,
  type CrmTaggedField,
} from '@bellum/contracts'
import { hasPermission } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { Database, PenLine } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { crmPushApi } from '@/features/crm/api'
import { useAccountCrmProvenance } from '@/features/crm/hooks/useAccountCrmProvenance'
import { useTeam } from '@/features/team/hooks/useTeam'

/**
 * #4604 — dans une fiche FUSIONNÉE (#4603), ce qui vient du CRM du client se voit — deux endroits, une vérité :
 *  - `CrmFieldSourceTag` : à côté de la valeur, là où on la lit (« vient de HubSpot » / « corrigé dans Bellum ») ;
 *  - `AccountCrmSaysCard` : le bloc « Ce que dit ton CRM » (propriétaire, étape, affaires, activités, fusion).
 * Les deux lisent le même contrat (`crmFieldSource`, `crmSaysSummary`, GA-26) dans la provenance déjà chargée une
 * fois pour toute la fiche (`AccountCrmProvenanceProvider`, #4459). On nomme l'outil que l'espace a BRANCHÉ
 * (`CRM_TOOL_NAMES`), jamais un fournisseur de Bellum. Une absence ne fait aucune ligne, jamais « 0 » (GA-18/19),
 * une provenance inconnue aucune étiquette, et le corps d'une activité ne sort jamais (il n'arrive même pas ici).
 */
export function CrmFieldSourceTag({ field }: { field: CrmTaggedField }) {
  const { t } = useTranslation('accountDetail', { keyPrefix: 'crmSays' })
  const [showCrmVersion, setShowCrmVersion] = useState(false)
  const crm = useAccountCrmProvenance()?.crm ?? null
  const source = crmFieldSource(crm, field)
  if (!crm || !source) return null
  const tool = CRM_TOOL_NAMES[crm.provider]
  const Icon = source === 'crm' ? Database : PenLine
  // #4604.7 — la valeur corrigée à la main est celle qu'on lit ; la version du CRM se CONSULTE à côté, jamais écrasée.
  const crmVersion = field === 'stage' || field === 'owner' ? null : crmFieldCrmVersion(crm, field)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        data-crm-field-source={source}
        className="inline-flex items-center gap-1 text-xs text-[var(--bellum-text-secondary)]"
      >
        <Icon className="size-3" aria-hidden />
        {source === 'crm' ? t('fieldFromCrm', { tool }) : t('fieldHuman')}
      </span>
      {crmVersion ? (
        <>
          <button
            type="button"
            aria-expanded={showCrmVersion}
            onClick={() => setShowCrmVersion(open => !open)}
            className="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-medium text-[var(--bellum-text-accent)] transition-colors hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
          >
            {showCrmVersion ? t('fieldCrmVersionHide', { tool }) : t('fieldCrmVersionShow', { tool })}
          </button>
          {showCrmVersion ? (
            <span className="text-xs text-[var(--bellum-text-secondary)]">
              {t('fieldCrmVersion', { tool, value: crmVersion })}
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  )
}

/** #4604.4 — « budget_it » → « Budget it » : le nom d'API du champ, lisible, jamais traduit ni deviné. */
function customFieldLabel(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * #4295.23 — « Annuler la fusion » : la route existait (`POST /accounts/crm-fusions/:id/undo`), aucun écran ne
 * l'appelait. Réservé à qui branche le CRM (`integrations:manage`) : sans ce droit, le geste ne s'affiche pas.
 */
function UndoFusionButton({ fusionId }: { fusionId: string }) {
  const { t } = useTranslation('accountDetail', { keyPrefix: 'crmSays' })
  const queryClient = useQueryClient()
  const { team } = useTeam()
  const undo = useMutation({
    mutationFn: () => crmPushApi.undoFusion(fusionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'push', 'provenance'] })
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(t('fusionUndone'))
    },
    onError: () => toast.error(t('fusionUndoError')),
  })
  if (!team || !hasPermission(team.workspace.role, 'integrations:manage')) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={undo.isPending}
      className="mt-1 pointer-coarse:min-h-11"
      onClick={() => undo.mutate()}
    >
      {t('fusionUndo')}
    </Button>
  )
}

export function AccountCrmSaysCard() {
  const { t, i18n } = useTranslation('accountDetail', { keyPrefix: 'crmSays' })
  const crm = useAccountCrmProvenance()?.crm ?? null
  if (!crm) return null
  const summary = crmSaysSummary(crm)
  if (isCrmSaysEmpty(summary) && !crm.fusion) return null
  const dateOf = (iso: string) => new Date(iso).toLocaleDateString(i18n.language)
  const namedDeals = crm.deals.filter(deal => deal.title).slice(0, 3)

  return (
    <section
      data-testid="account-crm-says"
      aria-labelledby="account-crm-says-title"
      className="flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
    >
      <Text
        element="h3"
        size="sm"
        weight="semibold"
        id="account-crm-says-title"
        className="text-[var(--bellum-text-primary)]"
      >
        {t('title', { tool: summary.tool })}
      </Text>
      <ul className="space-y-1 text-sm text-[var(--bellum-text-secondary)]">
        {summary.owner ? (
          <li className="flex flex-wrap items-center gap-x-2">
            {t('owner', { name: summary.owner })}
            <CrmFieldSourceTag field="owner" />
          </li>
        ) : null}
        {summary.stage ? (
          <li className="flex flex-wrap items-center gap-x-2">
            {t('stage', { stage: summary.stage })}
            <CrmFieldSourceTag field="stage" />
          </li>
        ) : null}
        {summary.deals !== null ? (
          <li>
            {t('deals', { count: summary.deals })}
            {namedDeals.length > 0 ? (
              <ul className="mt-1 space-y-0.5 ps-4">
                {namedDeals.map((deal, index) => (
                  <li key={`${deal.title}-${index}`}>
                    {deal.stage ? t('dealWithStage', { title: deal.title, stage: deal.stage }) : deal.title}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ) : null}
        {summary.activities !== null && summary.lastActivityAt ? (
          <li>{t('activities', { count: summary.activities, date: dateOf(summary.lastActivityAt) })}</li>
        ) : null}
        {summary.customFields.map(field => (
          <li key={field.key} data-crm-custom-field>
            {t('customField', { label: customFieldLabel(field.key), value: field.value })}
          </li>
        ))}
        {crm.fusion ? (
          <li>
            {crm.fusion.absorbedName
              ? t('fusionNamed', {
                  tool: summary.tool,
                  name: crm.fusion.absorbedName,
                  date: dateOf(crm.fusion.mergedAt),
                })
              : t('fusion', { tool: summary.tool, date: dateOf(crm.fusion.mergedAt) })}
            <UndoFusionButton fusionId={crm.fusion.id} />
          </li>
        ) : null}
      </ul>
    </section>
  )
}
