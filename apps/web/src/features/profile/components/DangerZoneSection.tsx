import { Box, Button, SettingsRow, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDeleteAccount } from '@/features/auth/hooks/useDeleteAccount'

type DeleteConfirmProps = {
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}

function DeleteConfirm({ onConfirm, onCancel, deleting }: DeleteConfirmProps) {
  const { t } = useTranslation('profile')
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.25, ease: 'easeOut' as const }}
      className="px-4 py-4 space-y-3"
    >
      <Text size="sm" weight="medium" color="text-[var(--danger-soft-text)]">
        {t('danger.confirmPrompt')}
      </Text>
      <Box display="flex" className="items-center gap-3">
        <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting}>
          {deleting ? (
            <>
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
              {t('danger.deleting')}
            </>
          ) : (
            t('danger.confirmCta')
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={deleting}>
          {t('common:actions.cancel')}
        </Button>
      </Box>
    </motion.div>
  )
}

export const DangerZoneSection = memo(function DangerZoneSection() {
  const { t } = useTranslation('profile')
  const [confirming, setConfirming] = useState(false)
  const deleteAccount = useDeleteAccount()

  const handleDelete = useCallback(async () => {
    try {
      await deleteAccount.mutateAsync()
      toast.success(t('danger.toast.deleted'))
    } catch (err) {
      console.error('[Profile]', err)
      toast.error(t('danger.errors.deleteFailed'))
    } finally {
      setConfirming(false)
    }
  }, [deleteAccount, t])

  return (
    <SettingsBlock tone="danger" label={t('danger.title')} description={t('danger.description')}>
      {confirming ? (
        <DeleteConfirm
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
          deleting={deleteAccount.isPending}
        />
      ) : (
        <SettingsRow
          title={t('danger.rowTitle')}
          description={t('danger.rowDescription')}
          trailing={
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              {t('common:actions.delete')}
            </Button>
          }
        />
      )}
    </SettingsBlock>
  )
})
