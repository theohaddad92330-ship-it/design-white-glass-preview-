import type { PageSpec } from '../../types'

/**
 * /team/business — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/team/business.tsx` → `TeamBusinessPage.tsx`. Textes de `i18n/locales/fr/manager.json (`team.business.*`)`.
 */
export const teamBusinessPage: PageSpec = {
  id: 'app/team-business',
  surface: 'app',
  domain: 'team',
  route: 'apps/web/src/routes/team/business.tsx',
  title: 'Objectifs & affaires',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Objectifs & affaires', style: 'title' },
      {
        type: 'text',
        text: 'Les ambitions du mois, les affaires qui attendent une décision et le portefeuille de comptes : qui porte quoi, et quelle est la suite.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Objectifs du mois' } },
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
      text: 'Trois sous-vues dans l’adresse (`?vue=`) : Objectifs du mois, Revue des affaires, Portefeuilles. Un espace solo est ramené à l’état vide de /team.',
      source: 'apps/web/src/features/manager/team/TeamBusinessPage.tsx:1',
    },
  ],
}
