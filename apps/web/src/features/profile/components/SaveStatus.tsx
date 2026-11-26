import { cn } from '@bellum/ui'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AutoSaveStatus } from '@bellum/contracts'

type SaveStatusProps = {
  status: AutoSaveStatus
}

const TONES: Record<Exclude<AutoSaveStatus, 'idle'>, string> = {
  saving: 'text-[var(--text-ghost)]',
  saved: 'text-[var(--success-soft-text)]',
  error: 'text-[var(--danger-soft-text)]',
}

export const SaveStatus = memo<SaveStatusProps>(function SaveStatus({ status }) {
  const { t } = useTranslation('profile')
  return (
    <div className="h-5 flex items-center">
      <AnimatePresence mode="wait">
        {status !== 'idle' && (
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className={cn('flex items-center gap-1.5 text-xs', TONES[status])}
          >
            {status === 'saving' && <Loader2 className="size-3 animate-spin" />}
            {status === 'saved' && <Check className="size-3" />}
            {status === 'error' && <AlertTriangle className="size-3" />}
            {/* i18n keys: saveStatus.saving | saveStatus.saved | saveStatus.error */}
            <span>{t(`saveStatus.${status}`)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
