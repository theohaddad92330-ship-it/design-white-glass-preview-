import { Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { ContactPerimeter } from '@bellum/contracts'

/**
 * #4996 L6 — « Mon périmètre · Tout le compte », au-dessus de la liste des contacts.
 *
 * `outsideCount` vient de l'API (`outside_perimeter_count`) : `null` = le lecteur n'a posé aucune zone d'entité sur
 * ce compte, le segment n'existe pas (une absence ne fait aucune ligne). Le filtre est un angle, pas un droit : la
 * ligne « N hors de ton périmètre — Tout voir » dit ce qui est écarté et l'ouvre en un geste. Rien n'est affiché
 * quand il n'y a rien d'écarté (jamais « 0 »). Le calcul reste côté serveur.
 */
export function ContactsPerimeterBar({
  mode,
  outsideCount,
  onModeChange,
}: {
  mode: ContactPerimeter
  outsideCount: number | null
  onModeChange: (mode: ContactPerimeter) => void
}) {
  const { t } = useTranslation('teamGuardrails', { keyPrefix: 'perimeter' })
  if (outsideCount === null) return null
  const items: ContactPerimeter[] = ['mine', 'all']
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div
        role="group"
        aria-label={t('title')}
        className="inline-flex max-w-full overflow-x-auto rounded-lg border border-[var(--bellum-border)]"
      >
        {items.map(key => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => onModeChange(key)}
            className={`min-h-11 shrink-0 border-r border-[var(--bellum-border)] px-4 text-sm font-medium last:border-r-0 ${
              mode === key
                ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
                : 'text-[var(--bellum-text-secondary)]'
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>
      {outsideCount > 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="flex items-center">
          {t('outside', { count: outsideCount })}
          {mode === 'mine' ? (
            <Button variant="link" size="sm" className="min-h-11 px-1" onClick={() => onModeChange('all')}>
              {t('seeAll')}
            </Button>
          ) : null}
        </Text>
      ) : null}
    </div>
  )
}
