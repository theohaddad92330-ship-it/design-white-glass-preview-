import type { PageSpec } from '../../types'
import { responsiveDecision } from './_shared'

/**
 * /run — route conservée pour compatibilité des liens/favoris : redirige
 * immédiatement vers `/monitoring?view=lancer` (« Lancer une analyse » a été
 * fusionnée dans l'ombrelle consolidée Analyses). Même patron que `/offres`.
 *
 * Lu dans : `apps/dashboard-manager/src/app/run/page.tsx`.
 */
export const dmRunPage: PageSpec = {
  id: 'dm/run',
  surface: 'dm',
  domain: 'monitoring',
  route: 'apps/dashboard-manager/src/app/run/page.tsx',
  title: 'Lancer une analyse',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Lancer une analyse', style: 'title' }],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'md',
          content: {
            title: 'Redirection vers Analyses',
            description:
              '« Lancer une analyse » a été fusionnée dans l’ombrelle consolidée Analyses (onglet « Lancer une analyse »).',
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
      text: 'Route gardée UNIQUEMENT pour les liens/favoris existants, même patron que `/offres` : `redirect()` interrompt le rendu avant le premier pixel.',
      source: 'apps/dashboard-manager/src/app/run/page.tsx:8',
    },
    responsiveDecision('rien ne change au-delà de 1920 : la page ne rend jamais rien, elle redirige'),
    {
      kind: 'ecart',
      text: 'Rien ne peut casser à 1280/1440/1920/2560/3440 : `redirect()` (Next.js) interrompt le rendu avant le premier pixel — le JSX qui suit est du code mort, jamais atteint par aucune largeur.',
      source: 'apps/dashboard-manager/src/app/run/page.tsx:8',
    },
  ],
}
