import { useState } from 'react'
import { Text } from '@bellum/ui'
import { formatCount } from '@/lib/locale'
import type { BriefT } from './brief-t'

/**
 * Les longues listes d'une fiche (personnes, clients, ESN d'une zone) se
 * replient : les `initial` premières, puis « Voir N de plus » — le motif de
 * Découvrir (#3597.5 « dix comptes puis Voir 10 de plus »). Rien n'est retiré :
 * tout reste atteignable, et l'ordre de la source est celui de l'écran.
 * Recette 06/10/2026 : 453 personnes à plat faisaient un mur de 100 000 signes.
 */
export const SHOW_MORE_INITIAL = 10

export function useRevealed(total: number, initial: number = SHOW_MORE_INITIAL, step: number = SHOW_MORE_INITIAL) {
  const [shown, setShown] = useState(initial)
  const visible = Math.min(shown, total)
  const remaining = total - visible
  return {
    visible,
    remaining,
    revealMore: () => setShown(visible + step),
    nextCount: Math.min(step, remaining),
  }
}

/** Absent quand il ne reste rien à révéler : jamais un bouton qui n'ouvrirait rien. */
export function ShowMoreButton({
  t,
  nextCount,
  visible,
  total,
  onClick,
  testId,
}: {
  t: BriefT
  nextCount: number
  visible: number
  total: number
  onClick: () => void
  testId: string
}) {
  if (nextCount <= 0) return null
  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        className="inline-flex min-h-11 items-center rounded-md border border-[var(--bellum-border)] px-4 text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)]"
      >
        <Text size="sm" weight="medium">
          {t('showMore.action', { count: nextCount })}
        </Text>
      </button>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('showMore.progress', { shown: formatCount(visible), total: formatCount(total) })}
      </Text>
    </div>
  )
}
