import type { PageSpec } from '../../types'

/**
 * /onboarding/themes/$themeId — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/onboarding/themes/$themeId.tsx` → `OnboardingThemePage.tsx`. Textes de `i18n/locales/fr/onboarding.json (`themePage.*`)`.
 */
export const onboardingThemePage: PageSpec = {
  id: 'app/onboarding-theme',
  surface: 'app',
  domain: 'onboarding',
  route: 'apps/web/src/routes/onboarding/themes/$themeId.tsx',
  title: 'Thème',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Thème', style: 'title' }],
    progress: [{ type: 'text', text: 'Étape 1', style: 'caption', color: 'text/secondary' }],
    primary: [
      {
        type: 'text',
        text: 'Ces précisions sont facultatives. Les réponses hors contexte restent conservées et ne pilotent pas silencieusement les recommandations.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Retour' } },
      },
      { type: 'component', component: 'Button', props: { size: 'sm', content: { label: 'Continuer' } } },
    ],
  },
  states: {
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
      text: 'Un thème inconnu ramène au catalogue (redirection de la route). Les réponses sont enregistrées sur l’appareil, avec l’heure.',
      source: 'apps/web/src/features/onboarding/view/OnboardingThemePage.tsx:91',
    },
  ],
}
