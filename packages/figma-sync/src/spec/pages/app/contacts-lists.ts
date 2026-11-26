import type { PageSpec } from '../../types'

/**
 * /contacts/lists — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/contacts/lists.tsx` → `ContactListsPage.tsx`. Textes de `i18n/locales/fr/targets.json (`contactLists.*`)`.
 */
export const contactsListsPage: PageSpec = {
  id: 'app/contacts-lists',
  surface: 'app',
  domain: 'contacts',
  route: 'apps/web/src/routes/contacts/lists.tsx',
  title: 'Tes sélections de travail',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes sélections de travail', style: 'title' },
      {
        type: 'text',
        text: 'Les mêmes fiches, regroupées selon ta prospection. Pas une deuxième base : enregistrer une liste n’inscrit personne à une campagne.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Une liste' } },
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
      text: 'Une liste regroupe des fiches existantes : elle n’en crée aucune et n’inscrit personne à une campagne.',
      source: 'apps/web/src/features/target-lists/view/ContactListsPage.tsx:44',
    },
  ],
}
