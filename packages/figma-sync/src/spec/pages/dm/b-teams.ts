import type { PageSpec } from '../../types'
import { responsiveDecision } from './_shared'

/**
 * /teams — route conservée pour compatibilité des liens/favoris (dont le lien
 * « retour » de la fiche équipe) : redirige vers `/clients?view=esn`
 * (l'annuaire Équipes a été fusionné dans la vue Clients → ESN). La page de
 * DÉTAIL `/teams/[id]` reste inchangée — voir `dm/teams-detail`.
 *
 * Lu dans : `apps/dashboard-manager/src/app/teams/page.tsx`.
 */
export const dmTeamsPage: PageSpec = {
  id: 'dm/teams',
  surface: 'dm',
  domain: 'clients',
  route: 'apps/dashboard-manager/src/app/teams/page.tsx',
  title: 'Équipes',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Équipes', style: 'title' }],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'md',
          content: {
            title: 'Redirection vers Clients → ESN',
            description:
              'L’annuaire Équipes a été fusionné dans la vue Clients → ESN (annuaire + KPI par ESN sur un seul écran).',
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
      text: 'Route gardée aussi pour le lien « retour » de la fiche équipe (`/teams/[id]`), pas seulement pour les favoris externes.',
      source: 'apps/dashboard-manager/src/app/teams/page.tsx:5',
    },
    responsiveDecision('rien ne change au-delà de 1920 : la page ne rend jamais rien, elle redirige'),
    {
      kind: 'ecart',
      text: 'Rien ne peut casser à 1280/1440/1920/2560/3440 : `redirect()` (Next.js) interrompt le rendu avant le premier pixel.',
      source: 'apps/dashboard-manager/src/app/teams/page.tsx:11',
    },
  ],
}
