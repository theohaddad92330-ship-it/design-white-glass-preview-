import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { Plug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { connectionStatusLabel } from '@/lib/connection-status'
import type { ConnectorTile as ConnectorTileModel, TileStatus } from '../lib/connector-tiles'
import { CONNECTOR_ICONS } from './cards/connector-icons'
import { connectorLogo } from './cards/connector-logos'

// #4510 — badges teintés par jetons doux, comme la maquette (`.bo11-badge` green / amber / neutre).
const STATUS_VARIANT: Record<TileStatus, 'success' | 'warning' | 'default'> = {
  connected: 'success',
  action_required: 'warning',
  available: 'default',
  not_included_in_plan: 'default',
  contractual: 'default',
}

/**
 * #4510 — la carte de la grille, au dessin de la maquette V22 (`.bo11-integration`) : le logo, le nom, ce que
 * l'outil apporte, UNE phrase, l'état (Branché / À reconnecter / Non branché) et « Voir le parcours ». Environ
 * 250 px de haut quelle que soit la langue : la phrase est bornée à deux lignes.
 *
 * Tout le détail d'avant (droits, domaine, sandbox, ce qui est lu, synchro, reprise, capacités, diagnostic,
 * première synchro, Déconnecter) vit dans le tiroir (`ConnectorDrawer`), qui rend la carte COMPLÈTE : rien n'est
 * retiré, il est rangé un clic plus loin. Seule exception, voulue par le contrat : une autorisation expirée garde
 * « Reconnecter » SUR la carte — il ouvre le tiroir sur le geste de reconnexion de la carte complète, qui seul sait
 * redemander ce qu'il faut (domaine Salesforce, sandbox, #4431.2) avant de repartir chez l'éditeur.
 *
 * Le logo est celui du registre sous licence (`connectorLogo`) ; sans fichier, l'icône : jamais un logo
 * approximatif. Les deux tuiles sans connecteur propre (Collective.work, Facturation) gardent l'icône.
 */
export function ConnectorTile({
  tile,
  onOpen,
}: {
  tile: ConnectorTileModel
  onOpen: (tile: ConnectorTileModel) => void
}) {
  const { t } = useTranslation('integrationCenter')
  const { t: tTile } = useTranslation('integrations', { keyPrefix: 'gridTiles' })
  const own = tile.id === tile.connector
  const logoSrc = own ? connectorLogo(tile.connector) : null
  const Icon = (own ? (CONNECTOR_ICONS as Partial<Record<string, typeof Plug>>)[tile.connector] : undefined) ?? Plug
  const journey = t('grid.actions.journey')
  const expired = tile.status === 'action_required'

  return (
    <Card className="flex h-full flex-col gap-0 p-5" data-testid={`connector-tile-${tile.id}`}>
      <Box display="flex" className="items-center gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-control">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              decoding="async"
              className="size-8 rounded-sm bg-[var(--bellum-brand-logo-chip)] object-contain p-0.5"
            />
          ) : (
            <Icon className="size-5 text-[var(--bellum-text-secondary)]" />
          )}
        </span>
        <Box className="min-w-0 flex-1">
          <Text element="h3" size="base" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {tile.name}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" leading="snug">
            {tTile(`${tile.id}.category`)}
          </Text>
        </Box>
      </Box>
      <Text size="xs" className="my-4 line-clamp-2 min-h-[2.5rem] text-[var(--bellum-text-secondary)]">
        {tTile(`${tile.id}.usage`)}
      </Text>
      <Box
        as="footer"
        display="flex"
        className="mt-auto flex-wrap items-center justify-between gap-2 border-t border-[var(--bellum-border)] pt-4"
      >
        <Badge variant={STATUS_VARIANT[tile.status]}>
          {tile.status === 'connected' || tile.status === 'action_required' || tile.status === 'available'
            ? connectionStatusLabel(t, tile.status)
            : t(`grid.status.${tile.status}`)}
        </Badge>
        <Box display="flex" className="flex-wrap items-center gap-2">
          {expired ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="min-h-11"
              aria-label={t('grid.openAria', { action: t('grid.actions.reconnect'), name: tile.name })}
              onClick={() => onOpen(tile)}
            >
              {t('grid.actions.reconnect')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11"
            aria-label={t('grid.openAria', { action: journey, name: tile.name })}
            onClick={() => onOpen(tile)}
          >
            {journey}
          </Button>
        </Box>
      </Box>
    </Card>
  )
}
