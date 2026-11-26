import type { PageSpec } from '../../types'
import { responsiveDecision } from './_shared'

/**
 * /usage — route conservée pour compatibilité des liens/favoris : redirige
 * vers `/facturation?view=usage` (Coûts & usage a été fusionné dans l'écran
 * consolidé Facturation). Même patron que `/offres` et `/run`.
 *
 * Lu dans : `apps/dashboard-manager/src/app/usage/page.tsx`.
 */
export const dmUsagePage: PageSpec = {
  id: 'dm/usage',
  surface: 'dm',
  domain: 'facturation',
  route: 'apps/dashboard-manager/src/app/usage/page.tsx',
  title: 'Coûts & usage',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Coûts & usage', style: 'title' }],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'md',
          content: {
            title: 'Redirection vers Facturation',
            description: 'Coûts & usage a été fusionné dans l’écran consolidé Facturation (onglet « Usage »).',
          },
        },
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Redirection en cours' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'line' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Redirection impossible' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Route gardée UNIQUEMENT pour les liens/favoris existants, même patron que `/offres` et `/run`.',
      source: 'apps/dashboard-manager/src/app/usage/page.tsx:8',
    },
    responsiveDecision('rien ne change au-delà de 1920 : la page ne rend jamais rien, elle redirige'),
    {
      kind: 'ecart',
      text: 'Rien ne peut casser à 1280/1440/1920/2560/3440 : `redirect()` (Next.js) interrompt le rendu avant le premier pixel.',
      source: 'apps/dashboard-manager/src/app/usage/page.tsx:8',
    },
  ],
}
