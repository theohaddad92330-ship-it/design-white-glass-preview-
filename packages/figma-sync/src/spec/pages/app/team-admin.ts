import type { PageSpec } from '../../types'

/**
 * /team/admin — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/team/admin.tsx` → `TeamAdminView.tsx`. Textes de `i18n/locales/fr/teamAdmin.json`.
 */
export const teamAdminPage: PageSpec = {
  id: 'app/team-admin',
  surface: 'app',
  domain: 'team',
  route: 'apps/web/src/routes/team/admin.tsx',
  title: 'Un espace bien administré.',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Un espace bien administré.', style: 'title' },
      {
        type: 'text',
        text: 'Les personnes, leurs accès et les règles de travail communes.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Comprendre les accès' } },
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
      text: 'La matrice des accès est en lecture : un droit propre à une personne se règle depuis son bouton « Rôle ».',
      source: 'apps/web/src/features/team-admin/view/TeamAdminView.tsx:20',
    },
  ],
}
