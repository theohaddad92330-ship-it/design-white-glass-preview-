import type { MailThread } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useLinkThreadAccount } from '../api'

/**
 * RATTACHER UN FIL À LA MAIN (#2104.6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE GESTE EXISTE À CÔTÉ DE L'AUTO-DÉTECTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `thread-account-link.ts` rattache déjà un fil AUTOMATIQUEMENT sur l'adresse
 * exacte d'un contact ou un domaine sans ambiguïté (MAIL-01) — mais il refuse
 * exprès de trancher quand deux comptes partagent un domaine, ou quand
 * l'adresse est inconnue du portefeuille. Ce bouton n'apparaît QUE dans ce
 * cas (`thread.account` absent) : c'est le commercial qui sait, pas une
 * heuristique qui devine.
 *
 * `useAccounts` — comme `AccountPicker` de `CreateContactDialog.tsx` — n'est
 * monté qu'à l'ouverture : un hook qui tire la session entière ne doit pas
 * peser sur toute ligne de fil qui n'en a pas besoin.
 */
export function LinkAccountDialog({
  thread,
  open,
  onOpenChange,
}: {
  thread: MailThread | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('mailbox')
  const accountsQuery = useAccounts({ limit: 100 })
  const accounts = useMemo(
    () => (accountsQuery.data?.pages.flatMap(page => page.data) ?? []).filter(account => account.company_name?.trim()),
    [accountsQuery.data],
  )
  const [accountId, setAccountId] = useState('')
  const link = useLinkThreadAccount()

  const close = () => {
    setAccountId('')
    link.reset()
    onOpenChange(false)
  }

  const submit = () => {
    if (!thread || !accountId) return
    link.mutate({ threadId: thread.threadId, accountId }, { onSuccess: close })
  }

  if (!thread) return null

  return (
    <Dialog open={open} onOpenChange={value => (value ? onOpenChange(true) : close())}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('linkAccount.title')}</DialogTitle>
          <DialogDescription>
            {t('linkAccount.description', { subject: thread.subject ?? t('thread.noSubject') })}
          </DialogDescription>
        </DialogHeader>

        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger aria-label={t('linkAccount.selectAria')} className="pointer-coarse:min-h-11">
            <SelectValue placeholder={t('linkAccount.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map(account => (
              <SelectItem key={account.id} value={account.id}>
                {account.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {link.isError ? (
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {t('linkAccount.failed')}
          </Text>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={close} disabled={link.isPending}>
            {t('draft.cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={!accountId || link.isPending}>
            {link.isPending ? t('linkAccount.submitting') : t('linkAccount.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
