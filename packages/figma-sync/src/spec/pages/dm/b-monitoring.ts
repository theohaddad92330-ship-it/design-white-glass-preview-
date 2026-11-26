import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid, sectionCard } from './_shared'

/**
 * /monitoring — l'ombrelle « Analyses » : cockpit (défaut), liste des
 * exécutions, lancement manuel, enrichissement — un bascule en sous-onglet
 * (`?view=`), jamais quatre écrans. La maquette porte la vue par défaut
 * (Cockpit) ; les trois autres vivent derrière les mêmes onglets.
 *
 * Lu dans : `apps/dashboard-manager/src/app/monitoring/page.tsx` →
 * `_components/cockpit-panel.tsx` (KPI, détail par phase, grounding),
 * `runs-panel.tsx`, `lancer-panel.tsx`, `enrichment-panel.tsx`.
 */
export const dmMonitoringPage: PageSpec = {
  id: 'dm/monitoring',
  surface: 'dm',
  domain: 'monitoring',
  route: 'apps/dashboard-manager/src/app/monitoring/page.tsx',
  title: 'Analyses',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Analyses', style: 'title' },
      {
        type: 'text',
        text: 'Les analyses lancées, leur coût et leur contrat — le cockpit d’ensemble, la liste des exécutions, le lancement manuel et ce que l’enrichissement trouve réellement.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Tabs',
        props: { items: ['Cockpit', 'Analyses', 'Lancer une analyse', 'Enrichissement'] },
      },
    ],
    kpis: [
      kpiGrid(5, [
        kpiTile('Analyses', '—'),
        kpiTile('Taux succès', '—'),
        kpiTile('Coût total', '—'),
        kpiTile('Coût moyen', '—'),
        kpiTile('Durée moy.', '—'),
      ]),
    ],
    primary: [
      sectionCard('Détail par phase', [
        {
          type: 'text',
          text: 'Latence (moy / p50 / p95), coût, tokens.',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Phase', 'Runs', 'Lat. moy', 'p50', 'p95', 'Coût moy', 'Coût total', 'Tokens (in / out)'],
              rows: [['research', '—', '—', '—', '—', '—', '—', '—']],
            },
          },
        },
      ]),
      sectionCard(
        'Grounding — « citer ses sources »',
        [
          {
            type: 'grid',
            columns: 4,
            gap: '4',
            children: [
              { type: 'component', component: 'Gauge', props: { size: 'medium', content: { label: 'sourcé' } } },
              kpiTile('Cible atteinte', '—/—'),
            ],
          },
        ],
        'Ratio de faits sourcés (tag PUBLIC) vs faits HYPOTHÈSE, par analyse. Cible : moins de 5 % de faits non sourcés.',
      ),
      sectionCard(
        'File de décision',
        [
          {
            type: 'text',
            text: 'Une nature dont la donnée est absente ne produit aucune ligne — ce qu’on ne sait pas n’alerte jamais.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Nature', 'Sujet', 'Détail', 'Ancienneté', 'Action'],
                rows: [['—', '—', '—', '—', '—']],
              },
            },
          },
        ],
        'Cinq champs par ligne (#1647) : nature, sujet, détail chiffré, ancienneté, une action-lien vers l’écran où le geste existe déjà.',
      ),
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucune analyse sur la période' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          size: 'md',
          content: { title: 'Erreur', description: 'Message technique renvoyé tel quel.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une seule phrase d’écran au niveau de l’OMBRELLE (#1678), pas une par panneau : quatre phrases pour un écran diraient qu’il y a quatre écrans.',
      source: 'apps/dashboard-manager/src/app/monitoring/page.tsx:31',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/monitoring/_components/cockpit-panel.tsx:199'),
  ],
}
