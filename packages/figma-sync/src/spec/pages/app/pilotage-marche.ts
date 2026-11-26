import type { PageSpec } from '../../types'

/**
 * /accounts/marches — Veille territoriale (onglet de Comptes depuis le 14/10/2026, refonte
 * Pilotage ; `/pilotage/marche` redirige ici) : ce qui a BOUGÉ sur les territoires
 * suivis, semaine après semaine (distinct de l’écran Territoire, qui répond à
 * « qu’est-ce qu’il y a là-bas ? »). Aucune garde d’offre : donnée publique.
 *
 * Lu dans : `apps/web/src/routes/accounts/marches.tsx` → `MarketWatch.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/marketWatch.json`.
 */
export const pilotageMarchePage: PageSpec = {
  id: 'app/pilotage-marche',
  surface: 'app',
  domain: 'pilotage',
  route: 'apps/web/src/routes/accounts/marches.tsx',
  title: 'Marché',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Marché', style: 'title' },
      {
        type: 'text',
        text: 'Ce qui a bougé sur les territoires que tu suis, semaine après semaine.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          { type: 'component', component: 'Input', props: { content: { placeholder: 'Département (31, 69…)' } } },
          { type: 'component', component: 'Button', props: { content: { label: 'Suivre' } } },
        ],
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Couverture mémoire marché du portefeuille' } },
            children: [
              {
                type: 'placeholder',
                kind: 'chart',
                label: 'Complétude des comptes rattachés à un territoire',
                height: 'sm',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Adéquation structurelle' } },
            children: [
              {
                type: 'placeholder',
                kind: 'chart',
                label: 'Un compte et son critère, jamais une note globale',
                height: 'sm',
              },
            ],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Card',
        props: {},
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '3',
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                justify: 'between',
                children: [
                  { type: 'text', text: 'Département 69', style: 'body' },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'ghost', size: 'sm', content: { label: 'Ne plus suivre' } },
                  },
                ],
              },
              {
                type: 'grid',
                columns: 2,
                columnsMobile: 2,
                gap: '3',
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Offres IT publiées', value: '—' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'ESN implantées', value: '—' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Appels d’offres ouverts', value: '—' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Marchés attribués', value: '—' } },
                  },
                ],
              },
              { type: 'text', text: 'Mouvements de la semaine', style: 'caption', color: 'text/muted' },
              { type: 'text', text: 'Technologies demandées', style: 'caption', color: 'text/muted' },
              { type: 'text', text: 'Les ESN qui recrutent ici', style: 'caption', color: 'text/muted' },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Voir mes comptes dans ce département' } },
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
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Tu ne suis aucun territoire',
            description: 'Ajoute un département pour commencer à mesurer ce qui s’y passe.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de lire tes territoires pour le moment.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une valeur qui a atteint sa borne de collecte s’écrit « au moins 100 », jamais un total : les plafonds de collecte ne sont plus présentés comme un dénombrement (corrigé le 31/08/2026).',
      source: 'apps/web/src/features/market-watch/view/MarketWatch.tsx:27',
    },
    {
      kind: 'decision',
      text: 'La couverture structurelle (Market Memory) est placée EN HAUT et non en bas : elle répond à « qu’est-ce que je sais de mes comptes », donnée avant la variation puisqu’elle en fournit le dénominateur (#1635).',
      source: 'apps/web/src/features/market-watch/view/MarketWatch.tsx:70',
    },
    {
      kind: 'ecart',
      text: 'Une tendance ne s’affiche jamais « +0 » : trois silences distincts (veille qui démarre, première photo, marché réellement stable) ont chacun leur propre phrase — les confondre ferait chercher une panne là où il n’y en a pas.',
      source: 'apps/web/src/features/market-watch/view/MarketWatch.tsx:272',
    },
    {
      kind: 'decision',
      text: 'Responsive : les cartes de territoire (`grid gap-4 md:grid-cols-2`) restent en 1 colonne de 360 à 767 px, passent à 2 dès 768 px (tablette et bureau confondus jusqu’à 1920). Au-delà (2560, 3440), on n’étire jamais : la maquette cible 3 territoires par rangée plutôt que deux cartes très larges. La grille interne des quatre mesures par territoire reste à 2 colonnes à toutes les largeurs, y compris 360 — les libellés longs (« Appels d’offres ouverts ») doivent rester lisibles sur deux lignes plutôt que déborder.',
      source: 'apps/web/src/features/market-watch/view/MarketWatch.tsx:126',
    },
  ],
}
