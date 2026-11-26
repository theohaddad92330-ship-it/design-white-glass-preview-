import type { PageSpec } from '../../types'

/**
 * /onboarding/themes — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/onboarding/themes/index.tsx` → `OnboardingThemesPage.tsx`. Textes de `i18n/locales/fr/onboarding.json (`catalog.*`)`.
 */
export const onboardingThemesPage: PageSpec = {
  id: 'app/onboarding-themes',
  surface: 'app',
  domain: 'onboarding',
  route: 'apps/web/src/routes/onboarding/themes/index.tsx',
  title: 'Les thèmes à approfondir.',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Les thèmes à approfondir.', style: 'title' },
      {
        type: 'text',
        text: 'Le premier cadrage suffit pour commencer. Tout le catalogue reste accessible ; tu ne dois pas répondre à toutes les questions.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Un thème' } },
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
      text: 'Le catalogue est facultatif : aucune réponse n’est exigée, et le pied de page dit où l’on en est sans jamais compter un « 0 » comme une réussite.',
      source: 'apps/web/src/features/onboarding/view/OnboardingThemesPage.tsx:34',
    },
  ],
}
