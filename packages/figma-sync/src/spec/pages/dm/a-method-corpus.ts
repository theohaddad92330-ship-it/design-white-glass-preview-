import type { PageSpec } from '../../types'

/**
 * `/method-corpus` — gouvernance du corpus méthode, LECTURE SEULE (#3274.5,
 * épopée #3274). Chaque règle a un owner, un état, un verdict d'audit ; « branchée
 * au retrieval » dit si Laura consulte réellement la règle — `non mesuré` quand
 * l'IA n'a pas répondu, jamais un booléen deviné.
 *
 * Lu dans : `src/app/method-corpus/page.tsx`.
 */
export const methodCorpusPage: PageSpec = {
  id: 'dm/method-corpus',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/method-corpus/page.tsx',
  title: 'Corpus méthode',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Corpus méthode', style: 'title' },
      {
        type: 'text',
        text: 'Lecture seule — la gouvernance se modifie par commit sur method-corpus.ts, pas depuis cet écran. « Branché au retrieval » dit si Laura consulte réellement cette règle aujourd’hui.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'text',
        text: 'Corpus version 2026.09.28 (2026-09-28) — 182 règles.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Règle',
              'Catégorie',
              'Owner',
              'État',
              'Feature flag',
              'Verdict d’audit',
              'Version',
              'Branchée au retrieval',
            ],
            rows: [
              ['regle-exemple-a', 'discovery', 'produit', 'active', 'aucun', 'KEEP', '2026.09.28', 'oui'],
              ['regle-exemple-b', 'objection', 'ventes', 'active', 'aucun', 'MERGE', '2026.09.28', 'non'],
              [
                'regle-exemple-c',
                'closing',
                'ventes',
                'désactivée',
                'copilot-plan-edition-generique',
                'SUPERSEDED',
                '2026.09.28',
                'non mesuré',
              ],
            ],
          },
        },
      },
      { type: 'text', text: 'Historique de version', style: 'heading' },
      {
        type: 'text',
        text: '2026.09.28 (2026-09-28) — fondation du corpus : owner, état et verdict d’audit par règle.',
        style: 'body',
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucune donnée.' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Corpus illisible',
            description: 'IA injoignable : « branché au retrieval » non mesuré sur cette lecture.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Écran volontairement lecture seule : désactiver une règle en production reste un commit sur method-corpus.ts, pas un geste d’écran.',
      source: 'apps/dashboard-manager/src/app/method-corpus/page.tsx:15',
    },
    {
      kind: 'decision',
      text: '« Non mesuré » quand l’IA n’a pas répondu : la colonne « Branchée au retrieval » n’est jamais un « non » deviné (GA-18/19), et un bandeau le dit en clair au-dessus du tableau.',
      source: 'apps/dashboard-manager/src/app/method-corpus/page.tsx:96',
    },
    {
      kind: 'decision',
      text: 'Une règle désactivée affiche sa raison sous le badge d’état ; un historique de version suit le tableau, « Aucun jalon » quand il est vide.',
      source: 'apps/dashboard-manager/src/app/method-corpus/page.tsx:110',
    },
  ],
}
