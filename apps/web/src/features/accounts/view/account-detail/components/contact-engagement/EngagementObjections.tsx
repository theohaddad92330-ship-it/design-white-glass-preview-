import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ObjectionResponse } from './types'

export function EngagementObjections({ objections }: { objections: ObjectionResponse[] }) {
  const { t } = useTranslation('engagement')
  if (objections.length === 0) return null

  return (
    <div className="mt-5 space-y-3 rounded-lg border border-[color-mix(in_srgb,var(--bellum-warning)_28%,var(--bellum-border))] bg-[color-mix(in_srgb,var(--bellum-warning)_8%,transparent)] p-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-3.5 text-[var(--warning-soft-text)]" />
        <p className="text-xs font-medium text-[var(--bellum-text-primary)]">{t('objections.title')}</p>
      </div>
      {objections.slice(0, 2).map(item => (
        <div key={item.objection} className="text-xs leading-5">
          <p className="font-medium text-[var(--bellum-text-primary)]">{item.objection}</p>
          <p className="mt-1 text-[var(--bellum-text-secondary)]">{item.response}</p>
        </div>
      ))}
    </div>
  )
}
