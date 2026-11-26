import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SignalSource } from '@/features/discover/lib/discover-types'
import { ToggleChip } from './filter-controls'

/**
 * #4315.3 — chaque case de signal dit en UNE phrase ce qu'elle capte. La phrase est la description
 * accessible de la case (lecteur d'écran) ET s'affiche sous la rangée dès que la case reçoit le focus
 * ou le survol — le toucher donne le focus, donc le mobile la lit aussi. Un `title` seul ne le ferait
 * ni au clavier ni au doigt.
 */
export function SignalChips({
  sources,
  active,
  onToggle,
}: {
  sources: readonly SignalSource[]
  active: readonly SignalSource[]
  onToggle: (source: SignalSource) => void
}) {
  const { t } = useTranslation('discover')
  const baseId = useId()
  const [shown, setShown] = useState<SignalSource | null>(null)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {sources.map(source => (
          <span key={source} className="contents">
            <ToggleChip
              active={active.includes(source)}
              onClick={() => onToggle(source)}
              describedBy={`${baseId}-${source}`}
              onReveal={() => setShown(source)}
              onConceal={() => setShown(current => (current === source ? null : current))}
            >
              {t(`signalTypes.${source}`)}
            </ToggleChip>
            <span id={`${baseId}-${source}`} className="sr-only">
              {t(`rail.signalHint.${source}`)}
            </span>
          </span>
        ))}
      </div>
      <p
        data-testid="signal-hint"
        aria-hidden="true"
        className="min-h-4 text-xs"
        style={{ color: 'var(--text-secondary)' }}
      >
        {shown ? t(`rail.signalHint.${shown}`) : null}
      </p>
    </div>
  )
}
