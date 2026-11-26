import { useTranslation } from 'react-i18next'
import { isSilentSoFar } from './voice-level'

/**
 * #3455 — « la wave enregistre rien » : la preuve à l'écran que le micro capte,
 * pour la conversation vocale ET la dictée (un seul composant, GA-26).
 *
 * Niveau non mesuré (pas de Web Audio) → AUCUNE jauge, jamais une jauge à 0.
 * Si rien n'a dépassé le bruit de fond au bout de quelques secondes, l'écran le dit.
 */
export function VoiceLevelMeter({
  level,
  peak,
  elapsedMs,
}: {
  level: number | null
  peak: number | null
  elapsedMs: number
}) {
  const { t } = useTranslation('chat')
  const percent = level === null ? null : Math.round(Math.min(1, level * 4) * 100)
  return (
    <>
      {percent !== null ? (
        <span
          role="meter"
          aria-label={t('voice.conversation.levelAria')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--bellum-surface-2)]"
        >
          <span
            className="block h-full rounded-full bg-[var(--bellum-primary-500)] transition-[width] duration-100"
            style={{ width: `${percent}%` }}
          />
        </span>
      ) : null}
      {isSilentSoFar({ elapsedMs, peak }) ? (
        <span data-testid="voice-level-silent" className="text-xs text-[var(--warning-soft-text)]">
          {t('voice.conversation.silent')}
        </span>
      ) : null}
    </>
  )
}
