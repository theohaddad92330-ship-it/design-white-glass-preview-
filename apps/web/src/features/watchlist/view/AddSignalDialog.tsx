import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@bellum/ui'
import { DECLARED_SIGNAL_SOURCES } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'
import { LIBRARY_NATURES, type LibraryNature } from '../model/signal-library'

/**
 * « Ajouter un signal » (Théo signaux.N1) : un fait que le commercial a lui-même relevé, rattaché à un compte.
 *
 * Même écriture que « Ajouter un signal » de la fiche compte (`POST /accounts/:id/signals/declare`) : le fait
 * est gardé TEL QU'ÉCRIT, jamais reformulé. Aucune tâche, opportunité ni prise de contact n'est créée.
 */
export function AddSignalDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: { id: string; name: string }[]
}) {
  const { t } = useTranslation('watchlist', { keyPrefix: 'library.add' })
  const { t: tTypes } = useTranslation('watchlist', { keyPrefix: 'filters.types' })
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [accountId, setAccountId] = useState('')
  const [nature, setNature] = useState<LibraryNature>('other')
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')

  const declare = useMutation({
    mutationFn: () =>
      accountsApi.declareSignals(accountId, {
        // La seule source qu'admet le contrat d'écriture manuelle (doctrine c79) ; jamais un nom en dur dans l'écran.
        source: DECLARED_SIGNAL_SOURCES[0],
        entryKind: 'manual',
        signals: [
          {
            label: label.trim(),
            signalType: tTypes(nature),
            ...(date.trim() ? { signalDate: date.trim() } : {}),
          },
        ],
      }),
    onSuccess: () => {
      toast.success(t('done'))
      void queryClient.invalidateQueries({ queryKey: accountKeys.signals(user?.id) })
      setLabel('')
      setDate('')
      onOpenChange(false)
    },
    onError: error => toast.error(error.message || t('error')),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--bellum-text-primary)]">
            {t('account')}
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger aria-label={t('account')}>
                <SelectValue placeholder={t('accountPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--bellum-text-primary)]">
            {t('nature')}
            <Select value={nature} onValueChange={value => setNature(value as LibraryNature)}>
              <SelectTrigger aria-label={t('nature')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIBRARY_NATURES.map(value => (
                  <SelectItem key={value} value={value}>
                    {tTypes(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--bellum-text-primary)]">
            {t('fact')}
            <Textarea
              value={label}
              maxLength={500}
              rows={4}
              placeholder={t('factPlaceholder')}
              onChange={event => setLabel(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--bellum-text-primary)]">
            {t('date')}
            <Input
              value={date}
              maxLength={80}
              placeholder={t('datePlaceholder')}
              onChange={e => setDate(e.target.value)}
            />
          </label>
          <p className="text-xs text-[var(--bellum-text-muted)]">{t('noAutomation')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="plain" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button disabled={!accountId || !label.trim() || declare.isPending} onClick={() => declare.mutate()}>
              {t('submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
