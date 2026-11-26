import type { RecordLink, RecordLinkGroup, RecordPanelKind } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useRecordStatusLabel } from './useRecordStatusLabel'

/**
 * Zone 3 — les objets liés, TOUS cliquables. Un clic sur un objet remplace le
 * contenu du panneau (`onOpen`) ; le compte, lui, s'ouvre par son nom
 * cliquable — sa fiche, jamais le panneau. Une relation absente ne fait aucun
 * groupe (l'API ne l'envoie pas).
 */
export function RecordLinksZone({
  groups,
  onOpen,
}: {
  groups: RecordLinkGroup[]
  onOpen: (kind: RecordPanelKind, id: string) => void
}) {
  const { t } = useTranslation('projects')
  return (
    <section aria-labelledby="record-zone-links" data-zone="links" className="space-y-3 pb-6">
      <Text element="h3" id="record-zone-links" size="sm" weight="medium" className="px-5 pt-4">
        {t('recordPanel.zones.links')}
      </Text>
      {groups.length === 0 ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="px-5">
          {t('recordPanel.linksEmpty')}
        </Text>
      ) : (
        groups.map(group => (
          <Box key={group.kind} className="space-y-1 px-5">
            <Text element="h4" size="xs" color="text-muted-foreground">
              {t(`recordPanel.linkGroups.${group.kind}`, { count: group.items.length })}
            </Text>
            <ul className="space-y-1">
              {group.items.map(item => (
                <li key={`${item.kind}-${item.id}`}>
                  <LinkRow item={item} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </Box>
        ))
      )}
    </section>
  )
}

function LinkRow({ item, onOpen }: { item: RecordLink; onOpen: (kind: RecordPanelKind, id: string) => void }) {
  const className =
    'flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted pointer-fine:min-h-8'
  // #4191 (E6) — le statut d'un objet lié se LIT (« Envoyé au client »), jamais « submitted ».
  const statusLabel = useRecordStatusLabel()
  const label = statusLabel(item.kind, item.status)
  const status = label ? (
    <Text element="span" size="xs" color="text-muted-foreground">
      {label}
    </Text>
  ) : null
  if (item.kind === 'account') {
    return (
      <Link to="/accounts/$id" params={{ id: item.id }} className={className}>
        <span>{item.label}</span>
        {status}
      </Link>
    )
  }
  const kind: RecordPanelKind = item.kind
  return (
    <button type="button" className={className} onClick={() => onOpen(kind, item.id)}>
      <span>{item.label}</span>
      {status}
    </button>
  )
}
