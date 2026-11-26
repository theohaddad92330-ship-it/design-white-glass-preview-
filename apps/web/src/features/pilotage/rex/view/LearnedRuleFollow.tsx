import type { LearnedRuleOutcomeTally } from '@bellum/contracts'
import { learnedRuleRef } from '@bellum/contracts'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { planItemsApi } from '@/features/actions/planItems.api'
import { LEARNING_KEYS } from '../learning-api'

/**
 * #3295 — l'ATTRIBUTION d'une action à une règle apprise ACTIVÉE, et sa mesure.
 *
 * Sans ce rattachement, « la règle a-t-elle aidé ? » serait une corrélation
 * devinée. Le geste écrit UNE action du plan portant `learned:<id>` (la même
 * porte que toute action : `planItemsApi.create`) ; la ligne de mesure en
 * COMPTE les issues. Jamais un taux, jamais une désactivation automatique :
 * « tes résultats la contredisent » est un signal, le responsable décide.
 * Une règle jamais suivie ne fait aucune ligne de mesure.
 */
export function LearnedRuleFollow({ ruleId, tally }: { ruleId: string; tally: LearnedRuleOutcomeTally | undefined }) {
  const { t } = useTranslation('pilotage')
  const qc = useQueryClient()
  const accounts = useAccounts({ limit: 100 }).data?.pages.flatMap(page => page.data) ?? []
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [label, setLabel] = useState('')

  const follow = useMutation({
    mutationFn: () =>
      planItemsApi.create({
        account_id: accountId,
        label: label.trim(),
        reason: t('rex.learning.follow.reason'),
        // #2395.8 — résultat attendu requis à la création.
        expected_outcome: t('rex.learning.follow.expectedOutcome'),
        target: null,
        method_rule: learnedRuleRef(ruleId),
      }),
    onSuccess: async () => {
      toast.success(t('rex.learning.follow.done'))
      setOpen(false)
      setAccountId('')
      setLabel('')
      await qc.invalidateQueries({ queryKey: LEARNING_KEYS.outcomes })
    },
    onError: () => toast.error(t('rex.learning.follow.error')),
  })

  return (
    <div className="mt-2 space-y-2">
      {tally ? (
        <>
          <Text size="xs" className="block text-[var(--bellum-text-muted)]">
            {t('rex.learning.follow.measure', {
              count: tally.followed,
              positive: tally.positive,
              negative: tally.negative,
              open: tally.open,
            })}
          </Text>
          {tally.contradicted ? (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('rex.learning.follow.contradicted')}
            </Text>
          ) : null}
        </>
      ) : null}
      {open ? (
        <div className="space-y-2">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger aria-label={t('rex.learning.follow.account')}>
              <SelectValue placeholder={t('rex.learning.follow.account')} />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(account => (
                <SelectItem key={account.id} value={account.id}>
                  {account.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={t('rex.learning.follow.label')}
            placeholder={t('rex.learning.follow.label')}
            value={label}
            maxLength={500}
            onChange={event => setLabel(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={follow.isPending || accountId === '' || label.trim().length === 0}
              className="pointer-coarse:min-h-11"
              onClick={() => follow.mutate()}
            >
              {t('rex.learning.follow.submit')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="pointer-coarse:min-h-11"
              onClick={() => setOpen(false)}
            >
              {t('rex.learning.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-coarse:min-h-11"
          onClick={() => setOpen(true)}
        >
          {t('rex.learning.follow.open')}
        </Button>
      )}
    </div>
  )
}
