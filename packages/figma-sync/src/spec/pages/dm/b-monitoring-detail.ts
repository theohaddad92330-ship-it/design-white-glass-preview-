import type { PageSpec } from '../../types'
import { GAIN_ASIDE, responsiveDecision, responsiveEcartTable, sectionCard } from './_shared'

/**
 * /monitoring/[id] — l'audit complet d'une analyse : propriétaire, télémétrie
 * par phase (coût, tokens, statut fournisseur), la charge d'échec, l'id de
 * corrélation (+ Sentry) et l'historique des runs, plus les contrôles admin
 * (STOP / forcer une erreur). Le dossier commercial riche vit sur
 * `/analysis/[id]` — ceci est la vue opérateur/debug.
 *
 * Lu dans : `apps/dashboard-manager/src/app/monitoring/[id]/page.tsx`.
 */
export const dmMonitoringDetailPage: PageSpec = {
  id: 'dm/monitoring-detail',
  surface: 'dm',
  domain: 'monitoring',
  route: 'apps/dashboard-manager/src/app/monitoring/[id]/page.tsx',
  title: 'Audit d’une analyse',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Compte exemple', style: 'title' },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          { type: 'component', component: 'Badge', props: { variant: 'default', content: { label: 'analyzing' } } },
          { type: 'text', text: '$0,42 · P7/10 · SIREN 000000000', style: 'caption', color: 'text/secondary' },
          { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Dossier complet' } } },
        ],
      },
    ],
    actions: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'destructive', size: 'sm', content: { label: 'Stopper' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Forcer une erreur' } },
          },
        ],
      },
    ],
    summary: [
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'E-mail', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Utilisateur', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Espace', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Créée le', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Mise à jour', value: '—' } } },
        ],
      },
    ],
    primary: [
      sectionCard('Échec', [
        {
          type: 'component',
          component: 'InfoBanner',
          props: {
            variant: 'danger',
            size: 'sm',
            content: { description: 'Raison de l’arrêt, non enregistrée si absente.' },
          },
        },
      ]),
      sectionCard('Détail par phase', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Phase', 'Coût', 'Durée', 'Tokens', 'Sources'],
              rows: [
                ['research', '—', '—', '—', '—'],
                ['contacts', '—', '—', '—', '—'],
                ['classify', '—', '—', '—', '—'],
                ['plan', '—', '—', '—', '—'],
              ],
            },
          },
        },
      ]),
      sectionCard('Fournisseurs par phase', [
        {
          type: 'component',
          component: 'Table',
          props: { table: { columns: ['Fournisseur', 'Statut', 'Détail'], rows: [['—', 'ok', '—']] } },
        },
      ]),
      sectionCard('Observabilité', [
        { type: 'component', component: 'CopyField', props: { content: { label: 'Id de corrélation', value: '—' } } },
        { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Ouvrir Sentry' } } },
      ]),
      sectionCard('Historique des runs', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Statut', 'Portée', 'Coût', 'Créé le', 'Terminé le'],
              rows: [['completed', '—', '—', '—', '—']],
            },
          },
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
          content: { title: 'Impossible de charger l’audit', description: 'Message technique renvoyé tel quel.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Les contrôles STOP / « Forcer une erreur » ne s’affichent QUE si l’analyse est encore en cours — jamais sur un run terminé, réussi ou en échec. Ce sont des boutons qui ÉCRIVENT (POST vers l’API d’admin) : chacun exige une confirmation native avant d’agir.',
      source: 'apps/dashboard-manager/src/app/monitoring/_components/stop-button.tsx:31',
    },
    responsiveDecision(GAIN_ASIDE),
    responsiveEcartTable(),
  ],
}
