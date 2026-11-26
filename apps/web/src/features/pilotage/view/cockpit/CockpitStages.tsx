import { useTranslation } from 'react-i18next'
import { CARD } from './cockpit-ui'
import type { CockpitFigures } from './useCockpitFigures'

/**
 * « Où se situe la décision ? » — le nombre d'affaires ouvertes par étape, une barre
 * par étape, et la phrase de conduite de Théo. Les étapes sont celles du produit
 * (Détecté … Négociation) : le vocabulaire des quatre étapes de la maquette est une
 * décision de Louis, pas une traduction silencieuse. Une étape sans affaire ne fait
 * aucune ligne ; aucune affaire ouverte, aucune carte.
 */
export function CockpitStages({ figures }: { figures: CockpitFigures }) {
  const { t } = useTranslation('pilotage')
  if (!figures.stagesLoaded || figures.stages.length === 0) return null
  const max = Math.max(...figures.stages.map(entry => entry.count))

  return (
    <section aria-labelledby="cockpit-stages" data-testid="cockpit-stages" className={CARD}>
      <h2 id="cockpit-stages" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
        {t('cockpit.stages.title')}
      </h2>
      <ul className="mt-5 space-y-3">
        {figures.stages.map(entry => (
          <li key={entry.stage} className="grid grid-cols-[minmax(7rem,9rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="text-[var(--bellum-text-primary)]">{t(`stages.${entry.stage}`)}</span>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
              <span
                className="block h-full rounded-full bg-[var(--bellum-primary-500)]"
                style={{ width: `${Math.max(8, Math.round((entry.count / max) * 100))}%` }}
              />
            </span>
            <span className="min-w-6 text-right font-semibold tabular-nums text-[var(--bellum-text-primary)]">
              {entry.count}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-[var(--bellum-border)] pt-4 text-sm text-[var(--bellum-text-secondary)]">
        {t('cockpit.stages.advice')}
      </p>
    </section>
  )
}
