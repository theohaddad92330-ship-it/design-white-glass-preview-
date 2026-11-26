import { Box } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { THEO_PILL } from './theo-classes'

type SubNavEntry = 'mine' | 'library' | 'journal'

/**
 * Théo C automations-bibliotheque.N4 — les sous-onglets « Mes automatisations · Bibliothèque de routines · Journal des
 * essais », avec leur compteur. Un compteur INCONNU ne s'affiche pas (`undefined`) : jamais « 0 » pour « pas encore lu ».
 * Trois ADRESSES, pas trois états : on peut partager un lien vers le journal, et le retour arrière fait ce qu'il dit.
 */
export function AutomationsSubNav({
  current,
  counts,
}: {
  current: SubNavEntry
  counts: Partial<Record<SubNavEntry, number>>
}) {
  const { t } = useTranslation('routines')
  const entries: {
    key: SubNavEntry
    to: '/actions/automatisations' | '/actions/automatisations/bibliotheque' | '/actions/automatisations/journal'
  }[] = [
    { key: 'mine', to: '/actions/automatisations' },
    { key: 'library', to: '/actions/automatisations/bibliotheque' },
    { key: 'journal', to: '/actions/automatisations/journal' },
  ]
  return (
    <nav aria-label={t('subnav.label')} className="mb-6 overflow-x-auto border-b border-[var(--bellum-border)]">
      <Box className="flex gap-6">
        {entries.map(entry => {
          const active = entry.key === current
          const count = counts[entry.key]
          return (
            <Link
              key={entry.key}
              to={entry.to}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? '-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-[var(--bellum-primary)] pb-3 pt-1 text-sm font-semibold text-[var(--bellum-text-primary)] pointer-coarse:min-h-11'
                  : '-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent pb-3 pt-1 text-sm text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11'
              }
            >
              {t(`subnav.${entry.key}`)}
              {count !== undefined ? <span className={`${THEO_PILL} tabular-nums`}>{count}</span> : null}
            </Link>
          )
        })}
      </Box>
    </nav>
  )
}
