import { Box, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

type AffairesTab = 'pipeline' | 'needs' | 'presentations'

/**
 * #4499 — l'onglet Besoins porte `?onglet=besoins` : `/projects/needs` NU redirige vers le Pipe (F1-FIX #4344),
 * et sans ce lien profond nommé l'onglet ramenait au Pipeline — le contrat y envoie pourtant « Créer un besoin »,
 * « Exporter les besoins » et la file de qualification.
 */
const TABS = [
  { key: 'pipeline', to: '/projects', search: undefined },
  { key: 'needs', to: '/projects/needs', search: { onglet: 'besoins' } },
  { key: 'presentations', to: '/projects/presentations', search: undefined },
] as const satisfies readonly { key: AffairesTab; to: string; search: { onglet: 'besoins' } | undefined }[]

/**
 * Théo C — la barre d'onglets d'Affaires (maquettes `projects-pipeline`, `-besoins`, `-presentations`).
 *
 * Trois écrans, une seule barre : le Pipeline, les Besoins et les Présentations s'ouvrent l'un depuis
 * l'autre sans repasser par la fiche d'une affaire. Les routes existent déjà — aucune n'est créée ici ;
 * la barre de section de la coque (`SectionTabs`) n'est pas touchée.
 */
export function AffairesTabs({ active }: { active: AffairesTab }) {
  const { t } = useTranslation('projects')
  return (
    <Box
      as="nav"
      aria-label={t('affairesTabs.label')}
      className="flex min-w-0 gap-1 overflow-x-auto border-b border-[var(--bellum-border)]"
    >
      {TABS.map(tab => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            to={tab.to}
            search={tab.search}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium',
              isActive
                ? 'border-[var(--bellum-text-accent)] text-[var(--bellum-text-accent)]'
                : 'border-transparent text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
            )}
          >
            {t(`affairesTabs.${tab.key}`)}
          </Link>
        )
      })}
    </Box>
  )
}
