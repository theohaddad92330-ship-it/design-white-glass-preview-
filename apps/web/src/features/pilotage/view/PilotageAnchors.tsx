import { useTranslation } from 'react-i18next'
import type { PILOTAGE_SECTIONS } from '../lib/pilotage-sections'

/**
 * Théo D pilotage.A0 — les ancres collantes d'une page longue : Cockpit · Pipe · Staffing · Finance.
 *
 * Des liens `#section`, jamais des onglets : une adresse se partage, le retour arrière revient à la
 * section précédente, et sans JavaScript la page reste lisible. Collant sous l'en-tête, cible ≥ 44 px.
 */
export function PilotageAnchors({ sections }: { sections: readonly (typeof PILOTAGE_SECTIONS)[number][] }) {
  const { t } = useTranslation('pilotage')
  return (
    <nav
      aria-label={t('theo.anchors.label')}
      className="sticky top-0 z-10 -mx-1 mt-4 flex gap-1 overflow-x-auto border-b border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-1"
    >
      {sections.map(section => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-medium text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
        >
          {t(section.labelKey)}
        </a>
      ))}
    </nav>
  )
}
