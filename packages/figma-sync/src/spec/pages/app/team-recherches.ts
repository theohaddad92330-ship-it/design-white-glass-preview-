import type { PageSpec } from '../../types'

/**
 * /team/recherches — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/team/recherches.tsx` → `TeamResearchView.tsx`. Textes de `i18n/locales/fr/teamResearch.json`.
 */
export const teamRecherchesPage: PageSpec = {
  id: 'app/team-recherches',
  surface: 'app',
  domain: 'team',
  route: 'apps/web/src/routes/team/recherches.tsx',
  title: 'Ne laisse pas une recherche dormir.',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ne laisse pas une recherche dormir.', style: 'title' },
      {
        type: 'text',
        text: 'Retrouve le périmètre exploré, les comptes analysés et la prochaine décision.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Une recherche' } },
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
      text: 'Un compte non mesuré se nomme « non mesuré », jamais « 0 » : il sort du dénominateur.',
      source: 'apps/web/src/features/team-research/view/TeamResearchView.tsx:29',
    },
  ],
}
