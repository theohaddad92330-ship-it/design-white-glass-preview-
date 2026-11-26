import type { PageSpec } from '../../types'
import { responsiveDecision } from './_shared'

/**
 * /offres — route conservée pour compatibilité des liens/favoris : redirige
 * immédiatement vers `/facturation?view=offres` (Offres a été fusionnée dans
 * l'écran consolidé Facturation). Aucun contenu propre : la maquette
 * documente la redirection, pas un écran qui n'existe plus.
 *
 * Lu dans : `apps/dashboard-manager/src/app/offres/page.tsx`.
 */
export const dmOffresPage: PageSpec = {
  id: 'dm/offres',
  surface: 'dm',
  domain: 'facturation',
  route: 'apps/dashboard-manager/src/app/offres/page.tsx',
  title: 'Offres',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Offres', style: 'title' }],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'md',
          content: {
            title: 'Redirection vers Facturation',
            description: 'Offres a été fusionnée dans l’écran consolidé Facturation (onglet « Offres »).',
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
      text: 'Route gardée UNIQUEMENT pour les liens/favoris existants — `redirect()` interrompt le rendu avant que le moindre contenu ne s’affiche. Tout le contenu réel vit sur `/facturation?view=offres`.',
      source: 'apps/dashboard-manager/src/app/offres/page.tsx:8',
    },
    responsiveDecision('rien ne change au-delà de 1920 : la page ne rend jamais rien, elle redirige'),
    {
      kind: 'ecart',
      text: 'Rien ne peut casser à 1280/1440/1920/2560/3440 : `redirect()` (Next.js) interrompt le rendu avant le premier pixel — le JSX qui suit (titre, bannière) est du code mort, jamais atteint par aucune largeur.',
      source: 'apps/dashboard-manager/src/app/offres/page.tsx:8',
    },
  ],
}
