import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, responsiveDecision } from './_shared'

/**
 * /runbook — le runbook opérateur : les gestes de support les plus fréquents
 * de la console, chacun renvoyant vers l'écran réel qui le porte. Une visite
 * guidée se relance depuis la dernière carte (même événement DOM que le
 * bouton du rail).
 *
 * Lu dans : `apps/dashboard-manager/src/app/runbook/page.tsx` →
 * `runbook.logic.ts` (les entrées).
 */
export const dmRunbookPage: PageSpec = {
  id: 'dm/runbook',
  surface: 'dm',
  domain: 'technique',
  route: 'apps/dashboard-manager/src/app/runbook/page.tsx',
  title: 'Runbook opérateur',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Runbook opérateur', style: 'title' },
      {
        type: 'text',
        text: 'Les gestes de support les plus fréquents de la console, et l’écran qui les porte.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Débloquer une analyse qui ne progresse plus' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', content: { label: 'Ouvrir l’écran →' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Suspendre ou réactiver un compte' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', content: { label: 'Ouvrir l’écran →' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Rejouer ou purger des jobs en échec' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', content: { label: 'Ouvrir l’écran →' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Revoir la visite guidée de la console' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'secondary', content: { label: 'Lancer la visite guidée' } },
              },
            ],
          },
        ],
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucun geste documenté' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger le runbook' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Aucune procédure n’invente un geste qui n’existe pas déjà ailleurs dans le manager : chaque carte RENVOIE vers un écran réel plutôt que de dupliquer sa logique.',
      source: 'apps/dashboard-manager/src/app/runbook/page.tsx:16',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    {
      kind: 'ecart',
      text: 'La grille de cartes est en `repeat(auto-fill, minmax(320px, 1fr))` (nombre de colonnes dépend de la largeur disponible, pas d’un palier fixe) : à 1280 comme à 3440, aucune règle n’assure explicitement 3 colonnes ni n’ajoute de colonne au-delà de 1920 — le nombre de cartes par ligne est un effet de bord de `minmax()`, jamais un choix éditorial.',
      source: 'apps/dashboard-manager/src/app/runbook/page.tsx:35',
    },
  ],
}
