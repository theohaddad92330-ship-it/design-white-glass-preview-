import { motion } from 'framer-motion'
import { DURATION, EASE, Text } from '@bellum/ui'
import { GitCompare, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ModalPortal } from '@/components/overlay/ModalPortal'
import { CompareAiSection } from './CompareAiSection'
import { CompareBestBanner } from './CompareBestBanner'
import { CompareDialogTable } from './CompareDialogTable'
import type { AccountRow } from './types'

interface CompareDialogProps {
  accounts: AccountRow[]
  onClose: () => void
}

/** Side-by-side comparison of 2–5 accounts, opened from the selection bar. */
export function CompareDialog({ accounts, onClose }: CompareDialogProps) {
  const { t } = useTranslation('accounts')
  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 16 }}
          transition={{ duration: DURATION.perceptible, ease: EASE.out }}
          className="w-full max-w-4xl max-h-[85dvh] overflow-auto rounded-2xl p-6 bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <GitCompare className="size-4 text-[var(--bellum-text-accent)]" />
              <Text element="h2" size="base" weight="semibold" className="text-[var(--text-primary)]">
                {t('compare.title')}
              </Text>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common:actions.close')}
              className="flex items-center justify-center w-7 h-7 rounded-sm transition-colors hover:bg-white/[0.06] text-[var(--text-ghost)]"
            >
              <X className="size-4" />
            </button>
          </div>

          <CompareDialogTable accounts={accounts} />
          <CompareBestBanner accounts={accounts} />
          <CompareAiSection accounts={accounts} />
        </motion.div>
      </motion.div>
    </ModalPortal>
  )
}
