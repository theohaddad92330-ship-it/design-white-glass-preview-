import type { AddLegalContractDocumentInput } from '@bellum/contracts'
import { Box, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'

type Visibility = NonNullable<AddLegalContractDocumentInput['visibility']>
const VISIBILITIES: Visibility[] = ['workspace', 'finance', 'owner']

/**
 * #2422.10 — l'écran de DÉPÔT d'une pièce. La version n'est jamais saisie :
 * le serveur la déduit du libellé (`nextLegalContractDocumentVersion`). Seul
 * le libellé et la portée partent ; une date ou une adresse se déposent par
 * l'API, pas de champ de plus ici.
 */
export function ContractDocumentForm({ accountId, contractId }: { accountId: string; contractId: string }) {
  const { t } = useTranslation('accountMissions')
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('workspace')

  const deposit = useMutation<unknown, Error, { label: string; visibility: Visibility }>({
    mutationFn: body =>
      apiFetch<unknown, typeof body>({
        path: `/delivery/accounts/${accountId}/contracts/${contractId}/documents`,
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts.contracts(accountId) })
      setLabel('')
      setVisibility('workspace')
      setOpen(false)
      toast.success(t('contracts.documents.deposit.done'))
    },
    onError: error => toast.error(t('contracts.documents.deposit.failed'), { description: error.message }),
  })

  if (!open) {
    return (
      <Box display="flex" className="pt-1">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t('contracts.documents.deposit.open')}
        </Button>
      </Box>
    )
  }

  return (
    <Box display="flex" className="flex-wrap items-center gap-2 pt-1">
      <Input
        value={label}
        maxLength={200}
        aria-label={t('contracts.documents.deposit.label')}
        placeholder={t('contracts.documents.deposit.label')}
        onChange={event => setLabel(event.target.value)}
        className="max-w-sm"
      />
      <Select value={visibility} onValueChange={value => setVisibility(value as Visibility)}>
        <SelectTrigger aria-label={t('contracts.documents.deposit.scope')} className="h-11 w-auto min-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VISIBILITIES.map(value => (
            <SelectItem key={value} value={value}>
              {t(`contracts.documents.visibility.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={label.trim().length === 0 || deposit.isPending}
        onClick={() => deposit.mutate({ label: label.trim(), visibility })}
      >
        {t('contracts.documents.deposit.submit')}
      </Button>
    </Box>
  )
}
