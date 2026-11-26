import type { PageSpec } from '../../types'
import { GAIN_MASTER_DETAIL, kpiGrid, kpiTile, responsiveDecision, responsiveEcartTable } from './_shared'

/**
 * /revenus/clients — un espace par ligne, avec sa SANTÉ sur cinq axes
 * pondérés : l'écran qui dit quel client rappeler aujourd'hui, et pourquoi.
 * Ce n'est PAS une probabilité de churn — un score DÉCOMPOSÉ, et un axe sans
 * donnée SORT du calcul, il ne compte jamais zéro.
 *
 * Lu dans : `apps/dashboard-manager/src/app/revenus/clients/page.tsx` →
 * `_components/clients-table.tsx`.
 */
export const dmRevenusClientsPage: PageSpec = {
  id: 'dm/revenus-clients',
  surface: 'dm',
  domain: 'revenus',
  route: 'apps/dashboard-manager/src/app/revenus/clients/page.tsx',
  title: 'Clients',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Clients', style: 'title' },
      {
        type: 'text',
        text: 'Un espace par ligne, avec sa santé sur cinq axes pondérés. Un axe sans donnée SORT du calcul : il ne compte jamais zéro.',
        style: 'body',
        color: 'text/secondary',
      },
      kpiGrid(4, [
        kpiTile('Espaces', '—', { period: 'tous' }),
        kpiTile('MRR cumulé', '—', { period: 'toutes les lignes mesurées' }),
        kpiTile('Alertes de churn', '—', { period: 'santé mesurée sous 25' }),
        kpiTile('Fonctions observées', '—', { period: 'dénominateur de l’adoption' }),
      ]),
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher un espace…' } },
          },
          { type: 'component', component: 'Button', props: { variant: 'secondary', content: { label: 'Rechercher' } } },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Espace',
              'Offre',
              'MRR',
              'Sièges',
              'Depuis',
              'Dernière activité',
              'Santé',
              'Crédits',
              'Facturation',
              'Actions',
            ],
            rows: [['Espace exemple', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
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
        props: { size: 'md', align: 'center', content: { title: 'Aucun espace client' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Santé des clients indisponible', description: 'L’API n’a pas répondu.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le score de santé N’EST PAS une probabilité de churn ou de renouvellement (le dépôt refuse les probabilités depuis six arbitrages) : c’est un score DÉCOMPOSÉ, cinq axes nommés, chacun avec ce qu’il a lu.',
      source: 'apps/dashboard-manager/src/app/revenus/clients/page.tsx:17',
    },
    {
      kind: 'decision',
      text: '`/clients` (annuaire des personnes, fiche ESN) reste en place : cet écran répond à une autre question (« ce client va-t-il partir ») et ne le remplace pas.',
      source: 'apps/dashboard-manager/src/app/revenus/clients/page.tsx:25',
    },
    responsiveDecision(GAIN_MASTER_DETAIL),
    responsiveEcartTable(),
  ],
}
