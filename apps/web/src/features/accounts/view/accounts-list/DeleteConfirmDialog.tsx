import { motion } from 'framer-motion'
import { Button, DURATION, EASE, Text } from '@bellum/ui'
import { ModalPortal } from '@/components/overlay/ModalPortal'
import { useTranslation } from 'react-i18next'

interface DeleteConfirmDialogProps {
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmDialog({ isPending, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const { t } = useTranslation('accounts')
  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: DURATION.perceptible, ease: EASE.out }}
          className="rounded-2xl p-6 w-full max-w-sm mx-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
          onClick={e => e.stopPropagation()}
        >
          <Text element="h3" size="base" weight="semibold" className="text-[var(--text-primary)] mb-2">
            {t('deleteDialog.title')}
          </Text>
          <Text element="p" size="sm" className="text-[var(--text-muted)] mb-5">
            {t('deleteDialog.description')}
          </Text>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" fullWidth onClick={onCancel}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" size="sm" fullWidth disabled={isPending} onClick={onConfirm}>
              {isPending ? t('deleteDialog.deleting') : t('common:actions.delete')}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  )
}
