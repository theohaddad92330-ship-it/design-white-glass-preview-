import { Box, Text } from '@bellum/ui'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TodayTile } from '../today-tiles'

/**
 * La rangée de tuiles de « Aujourd'hui ». Chaque tuile est un `<button>` : ce qui se
 * clique se tabule (GA-35), cible ≥ 44 px. Elle fait défiler jusqu'à la rangée qui
 * porte le chiffre — elle ne navigue pas, elle ne crée aucune route.
 */
export function TodayStatTiles({
  tiles,
  lead,
}: {
  tiles: TodayTile[]
  /** Louis 23/10 — la tuile qui ouvre la rangée (« Affaires en cours ») : elle lit sa propre source. */
  lead?: ReactNode
}) {
  const { t } = useTranslation('briefing')
  if (tiles.length === 0 && !lead) return null
  const jump = (target: string) => {
    document.getElementById(target)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  return (
    <Box role="list" aria-label={t('tiles.label')} className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {lead ? (
        <Box role="listitem" className="contents">
          {lead}
        </Box>
      ) : null}
      {tiles.map(tile => (
        <Box role="listitem" key={tile.id} className="contents">
          <button
            type="button"
            onClick={() => jump(tile.target)}
            className="flex min-h-11 min-w-0 flex-col items-start gap-1.5 rounded-card border border-[var(--bellum-border)] bg-card px-4 py-3.5 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]"
          >
            <Text element="span" size="xs" className="flex items-center gap-1 text-[var(--bellum-text-secondary)]">
              {t(`tiles.${tile.id}.label`)}
              <ChevronRight className="size-3" aria-hidden="true" />
            </Text>
            <Text element="span" size="3xl" weight="semibold" className="tabular-nums leading-none">
              {tile.count}
            </Text>
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t(`tiles.${tile.id}.hint`)}
            </Text>
          </button>
        </Box>
      ))}
    </Box>
  )
}
