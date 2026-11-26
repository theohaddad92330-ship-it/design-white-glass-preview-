import type { Account } from '@bellum/contracts'
import { ActionDialog, Button, Checkbox, SelectField, Text } from '@bellum/ui'
import { Workflow } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useProposeDealsBatch } from '@/features/crm/api'
import { useCrmDealPipelines } from '@/features/crm/hooks/useCrmDealPipelines'
import { useCrmPresence } from '@/features/crm/hooks/useCrmPresence'

type CrmOpenDealsBatchAdvanceProps = {
  account: Account
}

/**
 * #2854 (#2201.9) — le PREMIER appelant réel de `proposeDealsBatch` : le lot
 * livré le 27/09 (`2ede106c7`) fermait la porte de sécurité côté service, sans
 * écran pour la déclencher (« aucun écran ne pose encore de sélection
 * multiple qui appelle cet endpoint »).
 *
 * Les affaires ouvertes sont déjà lues par `CrmPresenceBadge` — même clé de
 * requête, aucune lecture supplémentaire. Present-only, comme le badge : un
 * LOT n'a de sens qu'à partir de deux affaires, jamais sous une case seule.
 *
 * Le lot reste PROPOSÉ, jamais écrit d'ici : chaque item redevient une
 * demande `pending` dans la file « À valider » (GA-26, la même porte qu'une
 * proposition seule) — ce composant ne fait que déposer la sélection.
 */
export function CrmOpenDealsBatchAdvance({ account }: CrmOpenDealsBatchAdvanceProps) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [stageId, setStageId] = useState('')

  const { data: presence } = useCrmPresence({
    companyName: account.company_name,
    website: account.website,
    siren: account.siren,
  })
  const deals = presence?.provider && presence.matched ? presence.openDeals : []
  const pipelines = useCrmDealPipelines(open && deals.length >= 2)
  const stageOptions = pipelines.data?.status === 'ready' ? (pipelines.data.pipelines[0]?.stages ?? []) : []

  const proposeBatch = useProposeDealsBatch()

  if (deals.length < 2) return null

  const closeAndReset = () => {
    setOpen(false)
    setSelected(new Set())
    setStageId('')
  }

  const selectedIds = deals.map(deal => deal.id).filter(id => selected.has(id))

  const submit = () => {
    if (selectedIds.length === 0 || !stageId || proposeBatch.isPending) return
    proposeBatch.mutate(
      selectedIds.map(dealId => ({ kind: 'deal_stage' as const, dealId, stageId })),
      {
        onSuccess: result => {
          const okCount = result.results.filter(item => item.ok).length
          const failedCount = result.results.length - okCount
          toast.success(
            failedCount > 0
              ? t('crmPresence.batchAdvance.resultPartial', { ok: okCount, failed: failedCount })
              : t('crmPresence.batchAdvance.resultOk', { count: okCount }),
          )
          closeAndReset()
        },
        onError: (error: Error) => toast.error(error.message || t('crmPresence.batchAdvance.error')),
      },
    )
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={next => (next ? setOpen(true) : closeAndReset())}
      icon={Workflow}
      title={t('crmPresence.batchAdvance.title')}
      description={t('crmPresence.batchAdvance.description')}
      triggerButton={
        <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11">
          {t('crmPresence.batchAdvance.trigger')}
        </Button>
      }
      validateButtonLabel={t('crmPresence.batchAdvance.submit')}
      validateButtonDisabled={selectedIds.length === 0 || !stageId}
      isLoading={proposeBatch.isPending}
      allowCancelAction
      onConfirm={submit}
      content={
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {deals.map(deal => (
              <li key={deal.id} className="flex items-center gap-2">
                <Checkbox
                  checked={selected.has(deal.id)}
                  aria-label={t('crmPresence.batchAdvance.checkboxLabel', { name: deal.name ?? deal.id })}
                  onCheckedChange={checked => {
                    const next = new Set(selected)
                    if (checked === true) next.add(deal.id)
                    else next.delete(deal.id)
                    setSelected(next)
                  }}
                />
                <Text size="sm">{deal.name ?? deal.id}</Text>
              </li>
            ))}
          </ul>
          <SelectField
            value={stageId}
            onChange={setStageId}
            ariaLabel={t('crmPresence.batchAdvance.targetStage')}
            placeholder={t('crmPresence.batchAdvance.choose')}
            options={stageOptions.map(stage => ({ value: stage.id, label: stage.label }))}
          />
        </div>
      }
    />
  )
}
