import type { PageSpec } from '../../types'

/**
 * /mes-cibles — « Ce qui bouge sur tes comptes » (#4088) : la page EST la
 * veille, une ligne par compte. Les listes de cibles ont quitté l'écran
 * (#4088.8) et vivent sur `/accounts?lens=lists`.
 *
 * Lu dans : `apps/web/src/routes/mes-cibles/index.tsx` →
 * `TargetListsPage.tsx` → `TargetListsContent.tsx` (entête) +
 * `TargetSignalsSection.tsx` → `WatchlistBoard.tsx` (filtres, tableau,
 * « Voir tout », « Écartés »). Textes :
 * `apps/web/src/i18n/locales/fr/targets.json` et `watchlist.json`.
 */
export const mesCiblesPage: PageSpec = {
  id: 'app/mes-cibles',
  surface: 'app',
  domain: 'mes-cibles',
  route: 'apps/web/src/routes/mes-cibles/index.tsx',
  title: 'Mes cibles',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ce qui bouge sur tes comptes', style: 'title' },
      {
        type: 'text',
        text: 'Par ordre de priorité : ce qui change, pourquoi ça compte, et qui contacter.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Paramétrer mes alertes' } },
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['À traiter', 'Mes comptes prioritaires', 'Selon mes règles'] },
      },
      {
        type: 'component',
        component: 'Input',
        props: { content: { placeholder: 'Rechercher un compte…' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Compte exemple' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              { type: 'component', component: 'DataRow', props: { content: { label: 'Ce qui bouge', value: '—' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Pourquoi ça compte', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Qui ça concerne', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Prochaine action', value: '—' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Voir tout (N)' } },
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Écartés (N)' } },
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
          align: 'start',
          content: {
            title: 'Aucun signal à suivre pour l’instant',
            description:
              'Les signaux naissent des comptes que tu analyses. Ajoute un premier compte et la veille se remplira toute seule.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Impossible de charger la veille', description: 'Réessaie dans quelques instants.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '#4088.1 — Le repli global de la veille disparaît (renverse #2747) : la page EST la veille, le titre vit dans l’entête de l’écran, plus de bandeau « Veille automatique… » ni « Sources publiques… ». `/watchlist` y redirige depuis #2151.60.',
      source: 'apps/web/src/features/target-lists/view/TargetSignalsSection.tsx:26',
    },
    {
      kind: 'decision',
      text: '#4088.5 — Trois filtres, pas cinq : « À traiter » est posé à l’arrivée ; un filtre dont le compte vaut 0 ne s’affiche pas (sans règle de veille, « Selon mes règles » disparaît).',
      source: 'apps/web/src/features/watchlist/view/WatchlistBoard.tsx:91',
    },
    {
      kind: 'decision',
      text: '#4088 — Une ligne = un compte : ce qui bouge (signal le plus fort, « +N autres »), pourquoi ça compte (une phrase dérivée du type, ou rien), qui ça concerne (nom et poste en clair), prochaine action (un verbe et une personne). Le badge de score nu a disparu au profit d’une raison de rang.',
      source: 'apps/web/src/features/watchlist/view/WatchlistTable.tsx:44',
    },
    {
      kind: 'decision',
      text: '#4088.6 — 20 comptes au chargement, puis « Voir tout (N) » où N = tous les comptes listés, jamais un compte de signaux.',
      source: 'apps/web/src/features/watchlist/view/WatchlistBoard.tsx:355',
    },
    {
      kind: 'decision',
      text: '#4088.7 — Hors domaine, stage, presse générale : les comptes sont ÉCARTÉS, repliés sous « Écartés (N) » en bas de page, jamais supprimés ; rien tant qu’il n’y en a aucun.',
      source: 'apps/web/src/features/watchlist/view/WatchlistBoard.tsx:363',
    },
    {
      kind: 'decision',
      text: '#4088.8 — Les listes de cibles ont quitté `/mes-cibles` : elles vivent sur Comptes, lentille « Listes » (`/accounts?lens=lists`), sans dépliant.',
      source: 'apps/web/src/features/target-lists/view/TargetListsSection.tsx:56',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : le chargement dessine un `Skeleton` à la forme du contenu — trois composants d’état, pas un de plus ; `Loader2` en dur est interdit.',
      source: 'apps/web/src/routes/mes-cibles/index.tsx:1',
    },
  ],
}
