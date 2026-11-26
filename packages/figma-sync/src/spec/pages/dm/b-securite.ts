import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid, sectionCard } from './_shared'

/**
 * /securite — l'état de sécurité du back-office : connexions récentes,
 * échecs, pays observés et anomalies détectées (rafale d'échecs, pays jamais
 * vu, heure inhabituelle) sur le journal d'accès. Écran de LECTURE : c'est le
 * dispatcheur d'alertes côté API qui envoie l'e-mail, pas cet écran.
 *
 * Lu dans : `apps/dashboard-manager/src/app/securite/page.tsx` →
 * `_components/securite-anomalies.tsx`, `securite-connexions.tsx`.
 */
export const dmSecuritePage: PageSpec = {
  id: 'dm/securite',
  surface: 'dm',
  domain: 'securite',
  route: 'apps/dashboard-manager/src/app/securite/page.tsx',
  title: 'Sécurité',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Sécurité', style: 'title' },
      {
        type: 'text',
        text: 'Connexions récentes, échecs, pays observés et anomalies détectées sur le journal d’accès du back-office — en lecture seule. L’alerte part par e-mail aux propriétaires, une fois par heure au plus pour un même sujet.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    filters: [{ type: 'component', component: 'TabNav', props: { variant: 'pill', items: ['7 j', '30 j', '90 j'] } }],
    kpis: [
      kpiGrid(5, [
        kpiTile('Connexions réussies', '—', { period: '— j' }),
        kpiTile('Échecs', '—', { period: '— j' }),
        kpiTile('Anomalies détectées', '—', { period: '— j' }),
        kpiTile('Pays observés', '—'),
        kpiTile('Acteurs distincts', '—'),
      ]),
    ],
    primary: [
      sectionCard('Anomalies', [
        {
          type: 'text',
          text: '— rafale(s) d’échecs · — pays inhabituel(s) · — connexion(s) à une heure inhabituelle.',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'component',
          component: 'Table',
          props: {
            table: { columns: ['Type', 'Acteur', 'Détail', 'Quand'], rows: [['rafale_echecs', '—', '—', '—']] },
          },
        },
      ]),
      sectionCard('Rétention', [
        { type: 'text', text: 'Purge automatique du journal à 365 jours.', style: 'caption', color: 'text/secondary' },
      ]),
      sectionCard('Connexions récentes', [
        {
          type: 'component',
          component: 'Table',
          props: { table: { columns: ['Qui', 'Quand', 'IP', 'Pays', 'Résultat'], rows: [['—', '—', '—', '—', '—']] } },
        },
      ]),
      sectionCard('Rôles actifs', [
        {
          type: 'component',
          component: 'Table',
          props: { table: { columns: ['Opérateur', 'Rôle'], rows: [['—', '—']] } },
        },
      ]),
      sectionCard('Impersonations en cours', [
        {
          type: 'component',
          component: 'Table',
          props: { table: { columns: ['Qui', 'Depuis', 'Motif'], rows: [['—', '—', '—']] } },
        },
      ]),
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
          content: {
            title: 'Non mesuré',
            description: 'Le journal ne contient aucun événement sur cette fenêtre. Ce n’est pas « zéro anomalie ».',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'État de sécurité indisponible',
            description: 'Une page qui afficherait « 0 anomalie » sur une panne mentirait par silence.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '« Non mesuré » n’est jamais « 0 anomalie » : une fenêtre sans événement le DIT en toutes lettres, à la place des cartes KPI — question qui tranche : si la valeur est absente, « 0 » est-il vrai ? Ici, non.',
      source: 'apps/dashboard-manager/src/app/securite/page.tsx:53',
    },
    {
      kind: 'decision',
      text: 'Rôle exigé `audit.read` (plancher `operator`) — même donnée, même porte que le journal d’audit ; la capacité se vérifie ICI, pas seulement à l’écran.',
      source: 'apps/dashboard-manager/src/app/securite/page.tsx:58',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/securite/page.tsx:146'),
  ],
}
