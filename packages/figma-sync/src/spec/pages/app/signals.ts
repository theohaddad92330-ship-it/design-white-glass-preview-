import type { PageSpec } from '../../types'

/**
 * /signals — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/signals/index.tsx` → `SignalsLibraryPage.tsx`. Textes de `i18n/locales/fr/signalsLibrary.json (`page.*`)`.
 */
export const signalsPage: PageSpec = {
  id: 'app/signals',
  surface: 'app',
  domain: 'signals',
  route: 'apps/web/src/routes/signals/index.tsx',
  title: 'Signaux',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Signaux', style: 'title' },
      { type: 'text', text: 'L’actualité de tes comptes, au même endroit.', style: 'body', color: 'text/secondary' },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Un signal' } },
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
      text: 'Une absence ne fait aucune ligne : on n’affiche pas ce qu’on n’a pas.',
      source: 'apps/web/src/features/signals-library/view/SignalsLibraryPage.tsx:68',
    },
  ],
}
