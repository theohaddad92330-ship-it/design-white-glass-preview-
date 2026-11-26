import type { PageSpec } from '../../types'

/**
 * /signals/watches — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/signals/watches.tsx` → `SignalWatchesPage.tsx`. Textes de `i18n/locales/fr/signalsLibrary.json (`watches.*`)`.
 */
export const signalsWatchesPage: PageSpec = {
  id: 'app/signals-watches',
  surface: 'app',
  domain: 'signals',
  route: 'apps/web/src/routes/signals/watches.tsx',
  title: 'Mes veilles',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Mes veilles', style: 'title' },
      { type: 'text', text: 'Les sujets que tu suis, compte par compte.', style: 'body', color: 'text/secondary' },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Une veille' } },
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
      text: 'Le suivi est explicite et par utilisateur : une veille n’existe que si la personne l’a posée.',
      source: 'apps/web/src/features/signals-library/view/SignalWatchesPage.tsx:34',
    },
  ],
}
