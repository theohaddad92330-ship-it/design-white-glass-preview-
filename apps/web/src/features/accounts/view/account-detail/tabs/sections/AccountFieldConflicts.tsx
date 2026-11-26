import { Text } from '@bellum/ui'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isConflictOpen, type ConflictedField } from '@bellum/contracts'
import { formatSignalDate } from '@/lib/signal-date'

/**
 * #190.1/#190.2/#190.8 (épopée #3219) — « je ne tranche pas », à l'écran.
 *
 * Une rangée de la carte « Sources et confiance » (même gabarit que la
 * fraîcheur et la confiance : `border-t px-4 py-3`), pas une carte de plus.
 * Les contradictions OUVERTES se nomment : les deux prétentions, leur source
 * (une CATÉGORIE, jamais un fournisseur), leur date, et quand revérifier. Les
 * tranchées toutes seules ne font qu'UNE ligne de décompte. Aucune contradiction
 * = aucune rangée : une absence ne fait pas de ligne.
 */
export function AccountFieldConflicts({ conflicts }: { conflicts: readonly ConflictedField[] }) {
  const { t } = useTranslation('accountDetail')
  const open = conflicts.filter(isConflictOpen)
  const settled = conflicts.length - open.length
  if (open.length === 0 && settled === 0) return null

  return (
    <div className="border-t border-[var(--bellum-border)] px-4 py-3">
      {open.length > 0 ? (
        <>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" />
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
              {t('provenance.conflicts.title', { count: open.length })}
            </Text>
          </div>
          <div className="mt-2 divide-y divide-[var(--bellum-border)]">
            {open.map(conflict => (
              <OpenConflict key={conflict.field} conflict={conflict} />
            ))}
          </div>
        </>
      ) : null}
      {settled > 0 ? (
        <Text
          size="xs"
          className={
            open.length > 0 ? 'mt-2 block text-[var(--bellum-text-muted)]' : 'block text-[var(--bellum-text-muted)]'
          }
        >
          {t('provenance.conflicts.settled', { count: settled })}
        </Text>
      ) : null}
    </div>
  )
}

function OpenConflict({ conflict }: { conflict: ConflictedField }) {
  const { t } = useTranslation('accountDetail')
  const label = t(`provenance.conflicts.fields.${conflict.field}`, { defaultValue: conflict.field.replace(/_/g, ' ') })
  const recheck = conflict.nextCheck ? formatSignalDate(conflict.nextCheck) : null
  return (
    <div className="py-2.5">
      <Text size="xs" weight="medium" className="block text-[var(--bellum-text-primary)]">
        {label}
      </Text>
      {conflict.claims.map((claim, index) => (
        <Text key={index} size="xs" className="block text-[var(--bellum-text-secondary)]">
          {t('provenance.conflicts.claim', {
            value: formatValue(claim.value),
            source: t(`provenance.conflicts.sourceTypes.${claim.source}`),
            date: formatSignalDate(claim.at),
          })}
        </Text>
      ))}
      {recheck ? (
        <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
          {t('provenance.conflicts.recheck', { date: recheck })}
        </Text>
      ) : null}
    </div>
  )
}

function formatValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value) ?? ''
}
