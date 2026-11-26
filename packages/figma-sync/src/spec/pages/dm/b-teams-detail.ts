import type { PageSpec } from '../../types'
import { GAIN_ASIDE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartTable, sectionCard } from './_shared'

/**
 * /teams/[id] — le drill-down d'une équipe (ESN) : KPI par commercial
 * (activité, conversion, crédits, activation), pipeline des comptes par
 * statut, et le tableau détaillé membre par membre. Lecture seule, derrière
 * `InternalSecretGuard`.
 *
 * Lu dans : `apps/dashboard-manager/src/app/teams/[id]/page.tsx` →
 * `../strings.ts`, `../_deep-kpis.tsx`, `../../_components/charts.tsx`.
 */
export const dmTeamsDetailPage: PageSpec = {
  id: 'dm/teams-detail',
  surface: 'dm',
  domain: 'clients',
  route: 'apps/dashboard-manager/src/app/teams/[id]/page.tsx',
  title: 'Équipe — drill-down',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'Button', props: { variant: 'link', content: { label: '← retour' } } },
      { type: 'text', text: 'ESN exemple', style: 'title' },
      {
        type: 'text',
        text: '— commerciaux · fenêtre 30 jours (7 · 30 · 90)',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    summary: [
      kpiGrid(4, [
        kpiTile('Analyses lancées', '—'),
        kpiTile('Messages', '—'),
        kpiTile('Taux de réponse', '—'),
        kpiTile('Crédits consommés', '—'),
      ]),
      sectionCard('Charge de travail', [
        kpiGrid(4, [
          kpiTile('Ouvertes', '—'),
          kpiTile('En retard', '—'),
          kpiTile('Bientôt dues', '—'),
          kpiTile('Sans échéance', '—'),
        ]),
      ]),
      sectionCard('Portefeuille', [kpiGrid(2, [kpiTile('Assigné', '—'), kpiTile('Non assigné', '—')])]),
    ],
    primary: [
      {
        type: 'grid',
        columns: 2,
        gap: '4',
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '2',
            children: [
              {
                type: 'text',
                text: 'Pipeline des comptes par statut commercial',
                style: 'caption',
                color: 'text/muted',
              },
              { type: 'component', component: 'Donut', props: { content: { total: '—' }, items: ['—'] } },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: '2',
            children: [
              {
                type: 'text',
                text: 'Messages VÉRIFIÉS par commercial — le déclaratif reste dans le tableau, jamais dans ce classement.',
                style: 'caption',
                color: 'text/muted',
              },
              { type: 'component', component: 'BarChart', props: { items: ['—'] } },
            ],
          },
        ],
      },
      sectionCard('Membres', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: [
                'Commercial',
                'Rôle',
                'Analyses (terminées)',
                'Comptes actifs',
                'Portefeuille',
                'Actions ouvertes',
                'Comptes chauds',
                'Enrichis',
                'Messages (vérifiés/déclarés)',
                'Réponses',
                'Taux de réponse',
                'RDV',
                'Deals',
                'Crédits',
                'Onboardé le',
                'Activé le',
                'Dernière activité',
              ],
              rows: [
                [
                  'Commercial exemple',
                  '—',
                  '—',
                  '—',
                  '—',
                  '—',
                  '—',
                  '—',
                  '—/—',
                  '—',
                  '—',
                  '—',
                  '—',
                  '—',
                  '—',
                  '—',
                  '—',
                ],
              ],
            },
          },
        },
      ]),
      sectionCard('Indicateurs approfondis', [
        {
          type: 'text',
          text: 'Trois familles, chacune tolérante à sa propre panne (un KPI en échec ne fait pas disparaître les deux autres).',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'grid',
          columns: 3,
          gap: '4',
          children: [
            sectionCard('CRM', [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [{ type: 'component', component: 'DataRow', props: { content: { label: '—', value: '—' } } }],
              },
            ]),
            sectionCard('Matching', [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [{ type: 'component', component: 'DataRow', props: { content: { label: '—', value: '—' } } }],
              },
            ]),
            sectionCard('Qualité', [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [{ type: 'component', component: 'DataRow', props: { content: { label: '—', value: '—' } } }],
              },
            ]),
          ],
        },
      ]),
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: { title: 'Impossible de charger l’équipe', description: 'Message technique renvoyé tel quel.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Charge de travail et portefeuille sont des blocs OPTIONNELS (servis par une API récente) : absents, ils sont masqués — un backoffice déployé avant l’API ne rend jamais « on ne sait pas » en 0.',
      source: 'apps/dashboard-manager/src/app/teams/strings.ts:1',
    },
    {
      kind: 'decision',
      text: 'Les indicateurs approfondis (CRM, matching, qualité) arrivent APRÈS le détail et chacun tolère SA propre panne : un opérateur qui perd tout l’écran parce qu’un seul KPI a échoué ne peut plus rien diagnostiquer.',
      source: 'apps/dashboard-manager/src/app/teams/_deep-kpis.tsx:1',
    },
    responsiveDecision(GAIN_ASIDE),
    responsiveEcartTable(),
  ],
}
