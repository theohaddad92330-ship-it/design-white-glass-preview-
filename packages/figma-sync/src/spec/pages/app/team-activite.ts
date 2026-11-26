import type { PageSpec } from '../../types'

/**
 * /team/activite — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/team/activite.tsx` → `TeamActivityView.tsx`. Textes de `i18n/locales/fr/teamActivity.json`.
 */
export const teamActivitePage: PageSpec = {
  id: 'app/team-activite',
  surface: 'app',
  domain: 'team',
  route: 'apps/web/src/routes/team/activite.tsx',
  title: 'Ce qui avance, ce qui se discute.',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ce qui avance, ce qui se discute.', style: 'title' },
      {
        type: 'text',
        text: 'Un fil de faits commerciaux et de décisions partagées. Pas de surveillance de présence.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Journal d’activité' } },
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { content: { title: 'Rien à afficher pour l’instant' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Cet écran n’a pas pu se charger. Rien n’a changé.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Deux onglets : Journal d’activité et Échanges d’équipe. Le journal montre des faits commerciaux, jamais la présence des personnes.',
      source: 'apps/web/src/features/team-activity/view/TeamActivityView.tsx:16',
    },
  ],
}
