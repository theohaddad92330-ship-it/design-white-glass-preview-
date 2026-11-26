import type { PageSpec } from '../../types'

/**
 * /team/plans — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/team/plans.tsx` → `TeamPlansPage.tsx`. Textes de `i18n/locales/fr/manager.json (`team.plans.*`)`.
 */
export const teamPlansPage: PageSpec = {
  id: 'app/team-plans',
  surface: 'app',
  domain: 'team',
  route: 'apps/web/src/routes/team/plans.tsx',
  title: 'Plans & actions',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Plans & actions', style: 'title' },
      {
        type: 'text',
        text: 'Du plan à l’action. Attribue, prépare et suis le travail, sans confondre tâche terminée et message envoyé.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Une action' } },
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
      text: 'Filtres par état (À faire, En retard, Aujourd’hui, Déléguées, Toutes) et trois modes d’affichage (Liste, Répartition, Semaine).',
      source: 'apps/web/src/features/manager/team/TeamPlansPage.tsx:1',
    },
  ],
}
