import type { PageSpec } from '../../types'

/**
 * `/dependances-manager` — ce dont LE MANAGER lui-même dépend (#1676.2) :
 * Stripe (facturation), Supabase (identité), Slack (alertes), Resend
 * (e-mails), Vercel (hébergement), GitHub (commit servi). Distinct de
 * `/health` (dépendances du PRODUIT) et `/integrations` (connecteurs du
 * client) — trois écrans, trois questions.
 *
 * Lu dans : `src/app/dependances-manager/page.tsx` →
 * `_components/dependency-row.tsx` (bouton « Tester » par ligne).
 */
export const dependancesManagerPage: PageSpec = {
  id: 'dm/dependances-manager',
  surface: 'dm',
  domain: 'system',
  route: 'apps/dashboard-manager/src/app/dependances-manager/page.tsx',
  title: 'Dépendances du manager',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Dépendances du manager', style: 'title' },
      {
        type: 'text',
        text: 'Ce dont CETTE console dépend pour fonctionner — distinct de « Santé système » (les dépendances du produit) et d’« Intégrations » (les connecteurs de chaque client). Chaque ligne se teste réellement, à la demande.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Configurées' } },
            children: [{ type: 'text', text: '5', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Non configurées' } },
            children: [{ type: 'text', text: '1', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Non mesurées' } },
            children: [{ type: 'text', text: '0', style: 'display' }],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Dépendance', 'Rôle', 'Présence', 'Test'],
            rows: [
              ['Stripe', 'Facturation récurrente', 'configuré', 'Tester'],
              ['Supabase', 'Identité d’opérateur', 'configuré', 'Tester'],
              ['Slack', 'Alertes sortantes', 'non configuré', 'Tester'],
            ],
          },
        },
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucune dépendance déclarée' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Liste des dépendances indisponible' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '« Sain » n’est jamais déclaré, il est dérivé d’un test réel : la colonne « Présence » (configuré / non configuré / non mesuré) s’affiche à l’ouverture, l’état réel — l’API a-t-elle RÉPONDU maintenant — demande le bouton « Tester » par ligne.',
      source: 'apps/dashboard-manager/src/app/dependances-manager/page.tsx:26',
    },
    {
      kind: 'decision',
      text: 'Trois écrans voisins répondent à trois questions différentes, jamais fusionnées : `/health` (dépendances du produit), `/integrations` (connecteurs de chaque client), `/dependances-manager` (ce dont la console elle-même dépend).',
      source: 'apps/dashboard-manager/src/app/dependances-manager/page.tsx:17',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 la grille de 3 KPI reste à 3 (elle tient déjà) ; le tableau de 4 colonnes garde toutes ses colonnes visibles (déjà compact) ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le tableau garderait sa largeur de lecture plutôt que de s’étirer — rien à gagner de plus sur un tableau à 4 colonnes.',
      source: 'apps/dashboard-manager/src/app/dependances-manager/page.tsx:57',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : au-delà de 1920, `.wrap` plafonne simplement à 1600 px — cohérent ici vu la faible largeur du tableau, mais ce n’est nulle part une décision explicite.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
  ],
}
