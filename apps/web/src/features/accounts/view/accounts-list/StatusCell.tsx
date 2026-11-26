import { Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { getStatusConfig, statusLabelKey } from './types'

interface StatusCellProps {
  status: string
  className?: string
}

export function StatusCell({ status, className }: StatusCellProps) {
  const { t } = useTranslation('accounts')
  const config = getStatusConfig(status)
  const isAnalyzing = status === 'analyzing'
  const Icon = config.icon

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Icon className={cn('size-3.5 shrink-0', config.text, isAnalyzing && 'animate-pulse')} />
      <Text element="span" size="sm" className="text-[var(--text-primary)]">
        {t(statusLabelKey(status))}
      </Text>
    </span>
  )
}
