import { Button } from '@bellum/ui'
import { motion } from 'framer-motion'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SearchErrorCardProps {
  message?: string | null
  onRetry: () => void
}

/**
 * « Analyse échouée » (état d'échec de la maquette R1) : une carte à gauche — le symbole teinté de
 * danger, le titre, ce qui s'est passé — puis « Le cadrage est conservé. » et « Réessayer », en aplat.
 * Le cadrage reste dessous, intact : on peut le corriger avant de relancer.
 */
export function SearchErrorCard({ message, onRetry }: SearchErrorCardProps) {
  const { t } = useTranslation('search')
  return (
    <motion.div
      role="alert"
      data-analyze-section="error"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className="mb-3 flex w-full flex-col gap-4 rounded-2xl border border-[var(--bellum-border)] bg-card px-4 py-5 md:px-7"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold text-[var(--bellum-text-primary)]">{t('error.title')}</p>
          <p className="mt-0.5 text-sm text-[var(--bellum-text-secondary)]">{message || t('error.unknownMessage')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--bellum-text-secondary)]">{t('error.framingKept')}</span>
        <Button variant="violet" icon={RotateCcw} onClick={onRetry} className="min-h-11 w-full md:w-auto">
          {t('common:actions.retry')}
        </Button>
      </div>
    </motion.div>
  )
}
