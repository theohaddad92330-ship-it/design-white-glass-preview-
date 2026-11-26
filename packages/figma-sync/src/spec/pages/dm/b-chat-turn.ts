import type { PageSpec } from '../../types'
import { responsiveDecision } from './_shared'

/**
 * /chat-turn/[id] — #2905 (#2442.16) : REPLAY EN LECTURE SEULE d'un tour de
 * Laura pour le support. Aucun outil relancé, aucun crédit débité, aucun
 * message renvoyé ; l'accès est journalisé (`chat.turn_replay_read`).
 *
 * Lu dans : `apps/dashboard-manager/src/app/chat-turn/[id]/page.tsx`.
 */
export const dmChatTurnPage: PageSpec = {
  id: 'dm/chat-turn',
  surface: 'dm',
  domain: 'monitoring',
  route: 'apps/dashboard-manager/src/app/chat-turn/[id]/page.tsx',
  title: 'Replay d’un tour de Laura',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tour {id}', style: 'title' },
      {
        type: 'text',
        text: 'Lecture seule — aucun outil relancé, aucun crédit débité, aucun message renvoyé.',
        style: 'body',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'md',
          content: {
            title: 'Messages du tour',
            description: 'Un bloc par message : rôle, horodatage, puis le contenu tel qu’il a été enregistré.',
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
        props: { size: 'md', align: 'center', content: { title: 'Aucun message pour ce tour' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'line' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Tour indisponible' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Replay en LECTURE SEULE, pas un rejeu du pipeline : l’écran couvre le NO-GO de #2442 (accès support non tracé) par un accès journalisé, même précédent que `analysis/[id]`.',
      source: 'apps/dashboard-manager/src/app/chat-turn/[id]/page.tsx:6',
    },
    responsiveDecision('la liste de messages s’étire, le texte garde ses retours à la ligne (`pre-wrap`)'),
  ],
}
