import type { PageSpec } from '../../types'
import {
  chartPlaceholder,
  GAIN_KPI_COLONNE,
  kpiGrid,
  kpiTile,
  responsiveDecision,
  responsiveEcartKpiGrid,
  sectionCard,
  stat,
} from './_shared'

/**
 * /revenus — le MRR de BellumAI, décomposé mois par mois : ce qui entre, ce
 * qui grossit, ce qui se rétracte, ce qui part. Tout se calcule sur les mois
 * FIGÉS, jamais le mois en cours. Écran RÉSERVÉ AU PROPRIÉTAIRE.
 *
 * Lu dans : `apps/dashboard-manager/src/app/revenus/page.tsx` →
 * `_components/snapshot-panel.tsx`.
 */
export const dmRevenusPage: PageSpec = {
  id: 'dm/revenus',
  surface: 'dm',
  domain: 'revenus',
  route: 'apps/dashboard-manager/src/app/revenus/page.tsx',
  title: 'Revenus',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Revenus', style: 'title' },
      {
        type: 'text',
        text: 'Le MRR de BellumAI, décomposé mois par mois. Tout se calcule sur les mois FIGÉS — un mois en cours est incomplet. Réservé au propriétaire.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      sectionCard(
        'Décomposition du mois',
        [
          {
            type: 'component',
            component: 'WaterfallChart',
            props: {
              data: 'complete',
              content: { period: 'dernier mois figé', asOf: '—' },
              items: ['MRR début', '+ Nouveau', '+ Expansion', '− Contraction', '− Churn', '= MRR fin'],
            },
          },
        ],
        'Le contrôle du solde est AFFICHÉ : la somme des composantes doit valoir le MRR de fin exactement (T2).',
      ),
      sectionCard('Douze mois de MRR', [
        chartPlaceholder(
          'Série 12 mois — Contraction et Churn tracés en valeur absolue, un mois sans mouvement coupe la ligne',
        ),
      ]),
      sectionCard('Métriques dérivées', [
        kpiGrid(3, [kpiTile('Rétention nette', '—'), kpiTile('LTV / CAC', '—'), kpiTile('Marge brute', '—')]),
      ]),
      sectionCard(
        'Revenus contractés (clients sur facture)',
        [
          {
            type: 'grid',
            columns: 4,
            gap: '4',
            children: [
              stat('Revenu contracté (mensuel)', '—'),
              stat('Clients sur facture', '—'),
              stat('Ponctuel facturé', '—'),
              stat('Contrats ponctuels', '—'),
            ],
          },
        ],
        'Un client sur facture n’entre JAMAIS dans le MRR : son engagement n’est pas un abonnement récurrent.',
      ),
      sectionCard(
        'MRR — instantanés mensuels',
        [
          {
            type: 'text',
            text: 'Le MRR n’inclut que les abonnements récurrents. Un mois figé n’est jamais recalculé.',
            style: 'caption',
            color: 'text/muted',
          },
          kpiGrid(2, [
            kpiTile('MRR (position du moment)', '—', { period: 'abonnements en cours — jamais figé' }),
            kpiTile('Clients récurrents', '—', { period: 'hors clients sur facture' }),
          ]),
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', content: { label: 'Figer le mois' } },
              },
              {
                type: 'text',
                text: 'Sert au premier instantané de la série. Un mois sauté ne se rattrape pas — il reste un trou nommé.',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: [
                  'Mois',
                  'MRR début',
                  'Nouveau',
                  'Expansion',
                  'Contraction',
                  'Churn',
                  'MRR fin',
                  'Clients',
                  'Contracté',
                ],
                rows: [['—', '—', '—', '—', '—', '—', '—', '—', '—']],
              },
            },
          },
        ],
        'Le bandeau de #1645, arrivé ici depuis /revenus/tresorerie (`SnapshotPanel`).',
      ),
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Aucun mois figé', description: 'La décomposition apparaîtra au premier instantané.' },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de lire les revenus' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une rétention ou une métrique absente affiche « — », jamais « 0 % » : un zéro inventé ferait croire à la faillite quand la raison réelle est juste « non mesuré ».',
      source: 'apps/dashboard-manager/src/app/revenus/page.tsx:207',
    },
    {
      kind: 'decision',
      text: 'Aucun repère de marché ne s’affiche sans sa source citée (T3) : un repère non sourcé est refusé par construction plutôt qu’inventé.',
      source: 'apps/dashboard-manager/src/app/revenus/page.tsx:222',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/revenus/page.tsx:202'),
  ],
}
