import type { PageSpec } from '../../types'

/**
 * /search/history — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/search/history.tsx` → `AnalysisHistoryPage.tsx`. Textes de `i18n/locales/fr/search.json (`history.*`)`.
 */
export const searchHistoryPage: PageSpec = {
  id: 'app/search-history',
  surface: 'app',
  domain: 'search',
  route: 'apps/web/src/routes/search/history.tsx',
  title: 'Tes analyses',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes analyses', style: 'title' },
      {
        type: 'text',
        text: 'Retrouve les dossiers consultés et le cadrage que tu avais préparé.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Une analyse' } },
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
      text: 'L’historique liste ce qui a été consulté ; un état vide ne fabrique aucune ligne.',
      source: 'apps/web/src/features/analysis-history/view/AnalysisHistoryPage.tsx:24',
    },
  ],
}
