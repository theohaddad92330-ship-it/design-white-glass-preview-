import type { PageSpec } from '../../types'

/**
 * `/flags` — feature flags Reflag, LECTURE SEULE : les flags se créent et se
 * ciblent dans le dashboard Reflag. Répond à « la fonctionnalité X est-elle
 * active pour CE client ? » — jamais une liste de définitions.
 *
 * Lu dans : `src/app/flags/page.tsx` (+ `_components/flag-coverage.ts` pour les
 * deux colonnes « non mesuré »).
 */
export const flagsPage: PageSpec = {
  id: 'dm/flags',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/flags/page.tsx',
  title: 'Feature flags',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Feature flags', style: 'title' },
      {
        type: 'text',
        text: 'Lecture seule — les flags se créent et se ciblent dans le dashboard Reflag. Cet écran répond à « la fonctionnalité X est-elle active pour CE client ? ».',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'User ID', placeholder: 'uuid' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Workspace ID', placeholder: 'uuid' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Évaluer' } },
          },
        ],
      },
    ],
    primary: [
      {
        type: 'text',
        text: 'Contexte évalué : défaut (aucun contexte)',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Clé', 'État', 'Espaces actifs', 'Activation'],
            rows: [
              ['export-pdf', 'actif', 'non mesuré', 'non mesuré'],
              ['beta-chat', 'inactif', 'non mesuré', 'non mesuré'],
              ['copilot-plan-edition-generique', 'actif', 'non mesuré', 'non mesuré'],
              ['rag-multi-espace', 'inactif', 'non mesuré', 'non mesuré'],
              ['facturation-preparee', 'actif', 'non mesuré', 'non mesuré'],
              ['discover-lots-detail', 'inactif', 'non mesuré', 'non mesuré'],
            ],
          },
        },
      },
      {
        type: 'text',
        text: 'Pourquoi « non mesuré » sur ces deux colonnes : Reflag ne fournit pas d’historique par espace ni de date d’activation sur ces requêtes.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucun flag défini dans Reflag' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Reflag n’est pas connecté',
            description: 'REFLAG_SECRET_KEY n’est pas défini côté API — tous les flags sont évalués à off.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '« Non mesuré » n’est jamais un tiret muet ni un « tous inactifs » deviné (GA-18/19) : la raison est dite UNE fois, en clair, sous le tableau — plus jamais dans un `title=` HTML (jamais lu au clavier, invisible au toucher, identique sur chaque ligne).',
      source: 'apps/dashboard-manager/src/app/flags/page.tsx:99',
    },
    {
      kind: 'decision',
      text: 'Écran volontairement lecture seule : pas de bouton créer/cibler un flag — Reflag reste la source de vérité, ce screen évalue pour un client donné plutôt que de dupliquer un CRUD.',
      source: 'apps/dashboard-manager/src/app/flags/page.tsx:9',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 la colonne « Activation » (la moins utilisée à l’œil) se masque en premier, gardant Clé/État/Espaces actifs ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le tableau garderait sa largeur de lecture et gagnerait un panneau de détail par flag plutôt que de s’étirer.',
      source: 'apps/dashboard-manager/src/app/flags/page.tsx:78',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : au-delà de 1920 rien ne change, `.wrap` plafonne simplement à 1600 px — pas de masquage de colonne à 1280 ni de panneau de détail mesurés aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
  ],
}
