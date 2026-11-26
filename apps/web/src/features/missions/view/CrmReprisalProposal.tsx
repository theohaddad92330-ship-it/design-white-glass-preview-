import { clientToolName } from '@bellum/contracts'
import { Box, Button, SelectField, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCreateMissionFromCrmReprisal, useCrmReprisalCandidates, type CrmReprisalCandidateDeal } from '../api'

/**
 * #2562 — LA PROPOSITION DE REPRISE, dans l'état vide de « Missions › En cours ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROPOSITION, PAS IMPORT
 * ─────────────────────────────────────────────────────────────────────────
 * Rien ici ne crée quoi que ce soit tout seul. `MissionCrmReprisalService`
 * (API) ne fait QUE lire et proposer ; c'est le geste ORDINAIRE de création
 * de mission (`useCreateMissionFromCrmReprisal`, la même écriture que sert
 * tout le produit) qui
 * écrit, et seulement quand la personne a :
 *  1. VU le deal, champ par champ (nom, stade) ;
 *  2. CHOISI le compte — jamais deviné : `crm_deal_facts` ne porte aucune
 *     association avec une entreprise (vérifié : ni le lecteur HubSpot ni le
 *     schéma du cache ne la portent), donc AUCUN code ne peut la déduire ;
 *  3. CLIQUÉ « Créer cette mission ». Le clic EST la décision — même
 *     doctrine que l'export de contact ou la création de tâche côté CRM.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA CORRESPONDANCE SE MONTRE, ELLE NE SE DEVINE PAS EN SILENCE (#2561/#2562)
 * ─────────────────────────────────────────────────────────────────────────
 * Le nom de l'outil vient de `clientToolName(data.provider)` — jamais un
 * littéral « HubSpot » écrit ici.
 */
export function CrmReprisalProposal() {
  const { t } = useTranslation('missions')
  const candidates = useCrmReprisalCandidates(true)

  // ⚠️ Pendant le chargement, on ne sait pas encore : un « rien à proposer »
  // affirmé ici mentirait une fois sur deux (même garde que la porte
  // contextuelle de `MissionsEmptyState`, qui attend la même chose du pipe).
  if (candidates.isLoading || !candidates.data?.available) return null

  const toolName = clientToolName(candidates.data.provider)

  return (
    <Box className="w-full max-w-xl space-y-3 rounded-lg border border-border bg-card p-4 text-left">
      <Text element="h3" size="sm" weight="semibold">
        {t('crmReprisal.title')}
      </Text>
      <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
        {toolName ? t('crmReprisal.correspondence', { tool: toolName }) : t('crmReprisal.correspondenceUnknownTool')}
      </Text>
      <Box className="space-y-2">
        {candidates.data.deals.map(deal => (
          <CrmReprisalRow key={deal.dealId} deal={deal} />
        ))}
      </Box>
    </Box>
  )
}

function CrmReprisalRow({ deal }: { deal: CrmReprisalCandidateDeal }) {
  const { t } = useTranslation('missions')
  // Une seule page (pas de recherche en direct) : le geste est de choisir un
  // compte DÉJÀ connu, pas d'en chercher un dans un espace qui en compte
  // des milliers — recette du 17/09 à mesurer si le besoin apparaît.
  const accounts = useAccounts({ limit: 100 })
  const options = (accounts.data?.pages[0]?.data ?? []).map(account => ({
    value: account.id,
    label: account.company_name,
  }))
  const [accountId, setAccountId] = useState('')
  const create = useCreateMissionFromCrmReprisal()

  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
    >
      <Box className="min-w-0 flex-1">
        {deal.name ? (
          <Text element="p" size="sm" weight="medium" className="truncate">
            {deal.name}
          </Text>
        ) : (
          <UnknownValue reason={t('crmReprisal.unknownName')} />
        )}
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {deal.stageLabel ?? deal.stage ?? t('crmReprisal.unknownStage')}
        </Text>
      </Box>
      <SelectField
        size="sm"
        className="min-w-0 max-w-[12rem]"
        ariaLabel={t('crmReprisal.chooseAccount')}
        placeholder={t('crmReprisal.chooseAccount')}
        value={accountId}
        emptyOption={{ label: t('crmReprisal.chooseAccount') }}
        options={options}
        onChange={setAccountId}
      />
      <Button
        type="button"
        size="sm"
        disabled={!accountId || create.isPending}
        className="pointer-coarse:min-h-11"
        onClick={() =>
          create.mutate({
            accountId,
            label: deal.name ?? t('crmReprisal.fallbackLabel'),
            crmDealId: deal.dealId,
          })
        }
      >
        {t('crmReprisal.createCta')}
      </Button>
    </Box>
  )
}
