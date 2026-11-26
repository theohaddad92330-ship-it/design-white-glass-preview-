import type { PageSpec } from '../../types'

/**
 * /missions/finance — « Revenu, marge et trésorerie » : la vue financière sous Missions, avec les cessions
 * d'affacturage en section ancrée (`#cessions`). Le droit Finance décide de tout : sans lui, l'écran est
 * REMPLACÉ par une demande d'accès — jamais un écran à moitié vide.
 *
 * Lu dans : `apps/web/src/routes/missions/finance.tsx` → `MissionsFinancePage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/missions.json` (`financeView.*`).
 */
export const missionsFinancePage: PageSpec = {
  id: 'app/missions-finance',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/finance.tsx',
  title: 'Revenu, marge et trésorerie',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Revenu, marge et trésorerie', style: 'title' },
      {
        type: 'text',
        text: 'Une lecture financière reliée aux missions, avec les inconnues et les pièces à traiter. Ce n’est pas un grand livre comptable.',
        style: 'caption',
        color: 'text/secondary',
      },
      { type: 'text', text: 'Visible avec le droit Finance', style: 'caption', color: 'text/muted' },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Cessions',
            description:
              'Les créances cédées au factor : encours, rapprochement des règlements, contrats d’affacturage.',
          },
        },
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Paiements et achats',
            description:
              'Les paiements aux consultants se suivent avec les autres paiements, à côté des encaissements.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir les paiements' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Frais de mission',
            description:
              'Les frais se saisissent et se valident dans les notes de frais ; le barème fixe ce qui est refacturable.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Notes de frais' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Barème des frais' } },
          },
        ],
      },
      {
        type: 'text',
        text: 'La marge à terminaison et la contribution après allocations internes se lisent dans le dossier de chaque mission.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'La vue financière demande le droit Finance',
            description:
              'Marges, coûts et paiements restent confidentiels. L’administrateur de l’espace peut te l’ouvrir.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Ton droit Finance n’a pas pu être vérifié. Réessaie dans un instant.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le droit Finance décide de tout : refusé, l’écran est REMPLACÉ par la demande d’accès (état `empty` ci-dessus) ; sans réponse du serveur (chargement, panne) on ne montre PAS les chiffres — le repli sûr est le plus fermé.',
      source: 'apps/web/src/features/missions/view/MissionsFinancePage.tsx:23',
    },
    {
      kind: 'decision',
      text: 'Les Cessions sont une section à part entière, ancrée `#cessions` (décision Louis 22/10/2026) : `/missions/cessions` y redirige. Les paiements sortants vivent dans Encaissements ; frais, barème et réglages sont des renvois.',
      source: 'apps/web/src/features/missions/view/MissionsFinancePage.tsx:14',
    },
  ],
}
