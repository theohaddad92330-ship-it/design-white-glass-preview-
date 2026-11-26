import { Box, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { ConnectedTool } from '@bellum/contracts'
import type { ConnectorTile } from '../lib/connector-tiles'
import type { ConnectorState } from '../lib/connectors'
import { CollectiveWorkNote } from './CollectiveWorkNote'
import { ConnectorExtras } from './ConnectorExtras'
import { CONNECTOR_CARDS } from './cards/connector-card-map'

const GUARANTEES = [
  ['readScope', 'readScopeBody'],
  ['noDuplicate', 'noDuplicateBody'],
  ['writesReviewed', 'writesReviewedBody'],
] as const

/**
 * Théo D settings-integrations.R3 — « Voir le parcours » / « Gérer » : le tiroir d'un connecteur.
 *
 * Il rend la carte COMPLÈTE d'avant (connexion, diagnostic, périmètre de lecture, première synchro) sous les
 * trois garanties de Théo (N6) : la grille est courte, le geste est intact. Les réglages propres à un
 * outil (la réponse d'absence d'Outlook et de Gmail) s'y ajoutent via `ConnectorExtras`.
 */
export function ConnectorDrawer({
  tile,
  state,
  tools,
  demoNote,
  onClose,
}: {
  tile: ConnectorTile | null
  state: ConnectorState | undefined
  tools: readonly ConnectedTool[]
  /** G.6 — la salle montre Gmail et HubSpot branchés (overlay de lecture) : la mention le dit. */
  demoNote: readonly string[]
  onClose: () => void
}) {
  const { t } = useTranslation('integrationCenter')
  const { t: tTile } = useTranslation('integrations', { keyPrefix: 'gridTiles' })
  const Card = tile ? CONNECTOR_CARDS[tile.connector] : null

  return (
    <Sheet open={tile !== null} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" closeLabel={t('grid.drawer.close')} className="w-full overflow-y-auto sm:max-w-xl">
        {tile && (
          <>
            <SheetHeader>
              <SheetTitle>{tile.name}</SheetTitle>
              <SheetDescription>{tTile(`${tile.id}.usage`)}</SheetDescription>
            </SheetHeader>
            <Box className="flex flex-col gap-4 px-4 pb-6">
              <Box as="section" aria-label={t('grid.drawer.guaranteesTitle')} className="flex flex-col gap-2">
                <Text size="sm" weight="semibold">
                  {t('grid.drawer.guaranteesTitle')}
                </Text>
                {GUARANTEES.map(([title, body]) => (
                  <Box key={title}>
                    <Text size="sm" weight="medium">
                      {t(`grid.drawer.${title}`)}
                    </Text>
                    <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                      {t(`grid.drawer.${body}`)}
                    </Text>
                  </Box>
                ))}
              </Box>
              {demoNote.length > 0 && (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('demoConnection', { name: demoNote.join(', ') })}
                </Text>
              )}
              {tile.id === 'collective_work' ? <CollectiveWorkNote /> : Card && <Card state={state} tools={tools} />}
              <ConnectorExtras connector={tile.id === tile.connector ? tile.connector : null} state={state} />
            </Box>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
