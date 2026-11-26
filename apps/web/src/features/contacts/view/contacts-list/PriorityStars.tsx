import { Box, cn } from '@bellum/ui'
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type PriorityStarsProps = {
  /** Score `priority` (0–10). Affiché en 5 étoiles → on divise par 2 et on arrondit. */
  value: number | null
}

/**
 * Étoiles de priorité — 0 à 5 remplies selon la valeur normalisée.
 *
 * Une priorité NON calculée n'affiche pas cinq étoiles vides : cinq étoiles
 * vides se lisent « ce contact ne vaut rien », alors que la vérité est « on ne
 * l'a pas encore évalué ». C'est le même mot pour deux choses opposées, et
 * c'est celle des deux qui fait ignorer un bon contact.
 */
export function PriorityStars({ value }: PriorityStarsProps) {
  const { t } = useTranslation('common')
  if (value === null) {
    return (
      <Box display="flex" className="gap-0.5">
        <span className="text-xs text-[var(--text-ghost)]">{t('unknownValue')}</span>
      </Box>
    )
  }
  const filled = Math.round(value / 2)
  return (
    <Box display="flex" className="gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < filled ? 'text-[var(--warning-soft-text)] fill-amber-400' : 'text-[var(--text-ghost)]',
          )}
        />
      ))}
    </Box>
  )
}
