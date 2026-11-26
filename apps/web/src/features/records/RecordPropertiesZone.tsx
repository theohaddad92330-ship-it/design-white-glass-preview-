import type { RecordPanelKind, RecordProperty } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecordStatusLabel } from './useRecordStatusLabel'

/**
 * Zone 1 du panneau — les champs clés. `content` (les gestes riches d'un type,
 * ex. l'opportunité) remplace la liste générique tant qu'on regarde l'objet
 * qui a ouvert le panneau ; après un clic sur un objet lié, la liste générique
 * lue côté API reprend. Une valeur absente ne fait AUCUNE ligne — jamais « 0 ».
 */
/** Les trois clés dont la valeur est un STATUT du catalogue (#4191 E6) : elles se lisent, elles ne s'affichent pas brutes. */
const STATUS_PROPERTY_KEYS: ReadonlySet<string> = new Set(['stage', 'status', 'availability'])

export function RecordPropertiesZone({
  kind,
  properties,
  content,
}: {
  kind: RecordPanelKind
  properties: RecordProperty[]
  content?: ReactNode
}) {
  const { t } = useTranslation('projects')
  const statusLabel = useRecordStatusLabel()
  // Une valeur de statut que le catalogue ne nomme pas n'est pas montrée telle quelle : pas de ligne.
  const rows = properties.flatMap(p => {
    if (p.value === null) return []
    if (!STATUS_PROPERTY_KEYS.has(p.key)) return [p]
    const label = statusLabel(kind, p.value)
    return label ? [{ ...p, value: label }] : []
  })
  return (
    <section aria-labelledby="record-zone-properties" data-zone="properties" className="space-y-2">
      <Text element="h3" id="record-zone-properties" size="sm" weight="medium" className="px-5 pt-4">
        {t('recordPanel.zones.properties')}
      </Text>
      {content ?? (
        <dl className="space-y-1 px-5">
          {rows.map(p => (
            <Box key={p.key} display="flex" className="items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">
                {t(`recordPanel.properties.${p.key}`, { defaultValue: p.key })}
              </dt>
              <dd className="text-sm">{p.value}</dd>
            </Box>
          ))}
        </dl>
      )}
    </section>
  )
}
