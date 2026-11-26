import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DistributePreviewResponse } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { useDistributeApply, useDistributePreview } from '../hooks'

/**
 * #4996 L6 (Q2) — « Répartir selon les périmètres » : un APERÇU figé par empreinte, puis un clic. Rien ne part
 * seul ; seuls les contacts sans porteur bougent. Un 409 à l'application = l'état a changé depuis l'aperçu : on
 * le dit et on le redemande, sans rien appliquer.
 */
export function DistributeByScopeDialog({ accountId }: { accountId: string }) {
  const { t } = useTranslation('teamGuardrails')
  const previewMutation = useDistributePreview(accountId)
  const applyMutation = useDistributeApply(accountId)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<DistributePreviewResponse | null>(null)
  const [message, setMessage] = useState<{ kind: 'stale' | 'error' | 'done'; text: string } | null>(null)

  const loadPreview = async () => {
    try {
      setPreview(await previewMutation.mutateAsync())
    } catch {
      setPreview(null)
      setMessage({ kind: 'error', text: t('team.distribute.failed') })
    }
  }
  const openDialog = (next: boolean) => {
    setOpen(next)
    if (next) {
      setMessage(null)
      setPreview(null)
      void loadPreview()
    }
  }
  const apply = async () => {
    if (!preview) return
    try {
      const result = await applyMutation.mutateAsync(preview.fingerprint)
      setPreview(null)
      setMessage({ kind: 'done', text: t('team.distribute.applied', { count: result.applied }) })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMessage({ kind: 'stale', text: t('team.distribute.stale') })
        await loadPreview()
      } else {
        setMessage({ kind: 'error', text: t('team.distribute.failed') })
      }
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" icon={Users} className="min-h-11" onClick={() => openDialog(true)}>
        {t('team.distribute.button')}
      </Button>
      <Dialog open={open} onOpenChange={openDialog}>
        <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('team.distribute.title')}</DialogTitle>
            <DialogDescription>{t('team.distribute.description')}</DialogDescription>
          </DialogHeader>
          {message ? (
            <Text size="sm" role={message.kind === 'done' ? 'status' : 'alert'}>
              {message.text}
            </Text>
          ) : null}
          {previewMutation.isPending && !preview ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('team.distribute.loading')}
            </Text>
          ) : null}
          {preview ? (
            <div className="flex flex-col gap-1">
              {preview.groups.length === 0 ? (
                <Text size="sm">{t('team.distribute.nothing')}</Text>
              ) : (
                <ul className="flex flex-col gap-1">
                  {preview.groups.map(group => (
                    <li key={group.user_id}>
                      <Text size="sm">
                        {t('team.distribute.group', {
                          count: group.count,
                          name: group.name ?? t('team.distribute.unknownMember'),
                          labels: group.labels.join(', '),
                        })}
                      </Text>
                    </li>
                  ))}
                </ul>
              )}
              {preview.unchanged_count > 0 ? (
                <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                  {t('team.distribute.unchanged', { count: preview.unchanged_count })}
                </Text>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            {preview && preview.groups.length > 0 ? (
              <Button className="min-h-11" isLoading={applyMutation.isPending} onClick={() => void apply()}>
                {t('team.distribute.apply')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
