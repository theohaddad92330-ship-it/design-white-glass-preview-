import type { PageSpec } from '../../types'

/**
 * /contacts/imports — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/contacts/imports.tsx` → `ImportsSourcesPage.tsx`. Textes de `i18n/locales/fr/importWizard.json (`contactsImport.*`)`.
 */
export const contactsImportsPage: PageSpec = {
  id: 'app/contacts-imports',
  surface: 'app',
  domain: 'contacts',
  route: 'apps/web/src/routes/contacts/imports.tsx',
  title: 'Contacts',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Contacts', style: 'title' },
      {
        type: 'text',
        text: 'Les sources d’import branchées et celles qu’on peut brancher.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Imports & sources' } },
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
      text: 'Chaque source se nomme par ce que l’espace a branché, jamais par un fournisseur qui nous sert.',
      source: 'apps/web/src/features/contacts-import/view/ImportsSourcesPage.tsx:17',
    },
  ],
}
