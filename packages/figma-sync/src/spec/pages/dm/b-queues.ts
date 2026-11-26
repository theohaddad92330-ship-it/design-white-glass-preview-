import type { PageSpec } from '../../types'
import {
  GAIN_MASTER_DETAIL,
  kpiGrid,
  kpiTile,
  responsiveDecision,
  responsiveEcartKpiGrid,
  responsiveEcartTable,
} from './_shared'

/**
 * /queues — les files d'attente BullMQ : quatre chiffres de tête (les trois
 * premiers sont des COMPTEURS où zéro est une vraie mesure, le quatrième une
 * ANCIENNETÉ qui n'affiche un chiffre que s'il y en a un), un sélecteur de
 * file, des onglets d'état, un filtre d'ancienneté, le tableau des jobs.
 *
 * Lu dans : `apps/dashboard-manager/src/app/queues/page.tsx` →
 * `_components/jobs-table.tsx`, `queue-age-filter.tsx`, `action-button.tsx`.
 */
export const dmQueuesPage: PageSpec = {
  id: 'dm/queues',
  surface: 'dm',
  domain: 'queues',
  route: 'apps/dashboard-manager/src/app/queues/page.tsx',
  title: 'Files d’attente BullMQ',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Files d’attente BullMQ', style: 'title' },
      kpiGrid(4, [
        kpiTile('En attente', '—', { period: '— files lues' }),
        kpiTile('En échec', '—'),
        kpiTile('Actifs', '—'),
        kpiTile('Plus vieux job en attente', 'aucun'),
      ]),
    ],
    actions: [
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'md', items: ['research', 'contacts', 'classify', 'plan'] },
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'pill', items: ['Échoués', 'En attente', 'Actifs', 'Terminés'] },
      },
      { type: 'component', component: 'FilterBar', props: { items: ['Ancienneté'] } },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Job',
              'Données',
              'Tentatives',
              'Créé',
              'Terminé',
              'Échec — raison + dernière ligne de stack',
              'Actions',
            ],
            rows: [['#0001', '—', '—', '—', '—', '—', '—']],
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
        props: { size: 'md', align: 'center', content: { title: 'Aucun job dans cette file' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de lire les files' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Les trois premiers KPI sont des COMPTEURS (zéro y est une vraie mesure) ; le quatrième est une ANCIENNETÉ qui n’affiche jamais « 0 » — « aucun », « inconnue » ou une durée.',
      source: 'apps/dashboard-manager/src/app/queues/page.tsx:172',
    },
    {
      kind: 'decision',
      text: 'La confirmation de purge NOMME la conséquence (combien de jobs, dans quelle file, ce qui est perdu) — jamais une question générique type « Purger TOUS les jobs échoués ? ».',
      source: 'apps/dashboard-manager/src/app/queues/page.tsx:263',
    },
    {
      kind: 'decision',
      text: 'Pill (`src/ui/Pill.tsx`, `<button aria-pressed>`) n’a pas d’équivalent direct au catalogue : rangée sur `FilterChips` (le catalogue n’a pas de bouton pilule seul, hors barre de filtre).',
      source: 'apps/dashboard-manager/src/ui/Pill.tsx:11',
    },
    responsiveDecision(GAIN_MASTER_DETAIL),
    responsiveEcartTable(),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/queues/page.tsx:175'),
  ],
}
