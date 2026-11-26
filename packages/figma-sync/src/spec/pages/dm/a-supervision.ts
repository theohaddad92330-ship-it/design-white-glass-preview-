import type { PageSpec } from '../../types'

/**
 * `/supervision` — back-office de supervision (chantier du 30/09/2026), LECTURE
 * SEULE. Quatre onglets (Runners CI, Base Supabase, Railway, Disponibilité) ;
 * chaque bloc porte son périmètre en titre. « non mesuré » n'est jamais « 0 ».
 * Un bandeau dit en clair ce qui n'est pas configuré, injoignable ou partiel.
 *
 * Lu dans : `src/app/supervision/page.tsx` et `supervision.logic.ts`.
 */
export const supervisionPage: PageSpec = {
  id: 'dm/supervision',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/supervision/page.tsx',
  title: 'Supervision',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Supervision', style: 'title' },
      {
        type: 'text',
        text: 'La flotte des runners CI, lue dans Grafana Cloud.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Runners CI · Base Supabase · Railway · Disponibilité',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    primary: [
      { type: 'text', text: 'Flotte', style: 'heading' },
      {
        type: 'text',
        text: 'Runners vus · Cœurs (total des hôtes) · Hôtes (ayant rendu une série)',
        style: 'caption',
        color: 'text/muted',
      },
      { type: 'text', text: 'Conteneur', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Hôte', 'Runner', 'CPU (cœurs / limite)', 'Mémoire / limite', 'Couche disque', 'OOM 24 h'],
            rows: [
              ['hote-exemple-a', 'runner-exemple-1', '1,5 / 2', '3,2 Go / 4 Go', '12,4 Go', '0'],
              ['hote-exemple-b', 'runner-exemple-2', 'non mesuré / 2', 'non mesuré', 'non mesuré', 'non mesuré'],
            ],
          },
        },
      },
      { type: 'text', text: 'Hôte — 24 h', style: 'heading' },
      {
        type: 'text',
        text: 'Séries 24 h par hôte ; un trou de mesure reste un trou, jamais un zéro.',
        style: 'body',
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucun hôte n’a rendu de série.' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Grafana injoignable',
            description: 'Supervision non configurée ou source injoignable : les valeurs sont « non mesuré ».',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '« Non mesuré » n’est jamais « 0 » : chaque formateur rend « non mesuré » sur une valeur absente, un vrai 0 reste 0.',
      source: 'apps/dashboard-manager/src/app/supervision/page.tsx:56',
    },
    {
      kind: 'decision',
      text: 'Chaque bloc porte son périmètre en titre (Flotte, Hôte, Conteneur) : une charge de 60 % ne dit rien tant qu’on ne sait pas si c’est celle d’une machine ou d’un conteneur.',
      source: 'apps/dashboard-manager/src/app/supervision/page.tsx:43',
    },
    {
      kind: 'decision',
      text: 'Le coût Railway est ESTIMÉ (usage moyen × tarif public), pas la facture ; le jeton Grafana ne descend jamais dans l’écran.',
      source: 'apps/dashboard-manager/src/app/supervision/page.tsx:50',
    },
  ],
}
