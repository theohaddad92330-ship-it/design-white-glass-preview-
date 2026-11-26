import type { PageSpec } from '../../types'

/**
 * /accounts — le portefeuille de comptes. LA page exemple du contrat : les
 * lots suivants écrivent les ~160 autres sur ce modèle.
 *
 * Lu dans : `apps/web/src/routes/accounts/index.tsx` → `AccountsPage.tsx`
 * (entête, vues, bascules) → `AccountContent.tsx` (barre d'outils, filtres,
 * tableau, panneau latéral, sélection, états). Les textes sont ceux de
 * `apps/web/src/i18n/locales/fr/accounts.json` et `launcher.json`.
 *
 * Les lignes du tableau sont des EMPLACEMENTS (« Compte exemple », « — ») et
 * non des entreprises inventées : la maquette montre la forme, pas une donnée.
 */
export const accountsPage: PageSpec = {
  id: 'app/accounts',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/index.tsx',
  title: 'Comptes',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ton portefeuille de comptes', style: 'title' },
      {
        type: 'text',
        text: 'Les entreprises que tu as décidé de suivre, toi ou quelqu’un de ton équipe.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: 'Demander à Laura de prioriser mon portefeuille' } },
      },
    ],
    // RUX-13 (`docs/revue-ux.md` §4) : deux niveaux, pas quatre. « Vues » (`intro`, `TabNav`
    // `underline`, 5 au plus + « Plus de vues ▾ ») — avant, un `TabNav` `pill` à 7 entrées ET des
    // `Tabs` dans `actions` (interdit : `actions` porte des verbes, pas des sous-ensembles) posaient
    // DEUX mécanismes de vues en plus des filtres. Les quatre statuts qui vivaient dans ces `Tabs`
    // (« En observation », « Comptes à potentiel », « Hors priorité ») rejoignent les vues sous
    // « Plus de vues ▾ » ; les pastilles (« Mes favoris », « Portés par un collègue ») deviennent des
    // filtres de la `FilterBar`, pas des `FilterChips` à côté des vues.
    intro: [
      {
        type: 'component',
        component: 'TabNav',
        props: {
          variant: 'underline',
          items: [
            'Tout le portefeuille',
            'Mes priorités',
            'Sans prochaine action',
            'Clients actifs',
            'À actualiser',
            'Plus de vues ▾',
          ],
        },
      },
    ],
    actions: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher un compte, un secteur ou un SIREN…' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Analyser une entreprise' } },
          },
        ],
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'xs', content: { label: '+ Filtre' } },
      },
      {
        type: 'component',
        component: 'FilterBar',
        props: {
          items: ['Secteur', 'Score', 'Étiquette', 'Mes favoris', 'Portés par un collègue'],
        },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'xs', content: { label: 'Tout effacer' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          // RUX-05/26 : `comfort` est le défaut app — déclaré ici pour l'exemple, une spec qui l'omet vaut `comfort`.
          density: 'comfort',
          table: {
            // RUX-15 (`docs/revue-ux.md` §4) : rôles mobiles déclarés par colonne, dans l'ordre
            // d'AFFICHAGE (les lignes ci-dessous restent indexées par POSITION) — la « prochaine
            // action » est `meta` partout où elle existe, jamais la sixième colonne qui disparaît.
            columns: [
              { label: 'Compte', mobile: 'title', priority: 1 },
              { label: 'Score /10', mobile: 'field', priority: 3 },
              { label: 'Accessibilité', mobile: 'field', priority: 4 },
              { label: 'Dernière analyse', mobile: 'field', priority: 5 },
              { label: 'Signal dominant', mobile: 'field', priority: 6 },
              { label: 'Prochaine action', mobile: 'meta', priority: 2 },
            ],
            rows: [
              ['Compte exemple 1', '—', '—', '—', '—', '—'],
              ['Compte exemple 2', '—', '—', '—', '—', '—'],
              ['Compte exemple 3', '—', '—', '—', '—', '—'],
            ],
          },
        },
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Comptes récents' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Compte exemple 1', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Compte exemple 2', value: '—' } },
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
            title: 'Aucun compte analysé pour l’instant',
            description:
              'Lance ta première analyse : tape le nom d’une entreprise cible et obtiens en quelques minutes son dossier de conquête — contacts réels, angles d’attaque, plan d’action.',
            action: 'Lancer ma première analyse',
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
          content: {
            title: 'Je n’ai pas pu charger la liste.',
            description: 'Réessaie — tes filtres sont conservés.',
            action: 'Réessayer',
          },
        },
      },
    ],
    // RUX-14 (docs/revue-ux.md T5) : distinct du vide « jamais rempli » ci-dessus — une vue
    // FILTRÉE qui ne rend rien invite à retirer un filtre, jamais à lancer une analyse.
    emptyFiltered: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Aucun compte ne passe ces filtres',
            description: 'Élargis ta recherche en retirant un ou plusieurs filtres.',
            action: 'Retirer les filtres',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'RUX-14 (docs/revue-ux.md T5, addenda au Top 20) : le gabarit `list` gagne un 2ᵉ état vide, `emptyFiltered`, distinct du vide « jamais rempli » (`empty`) — une vue filtrée qui ne rend rien invite à RETIRER un filtre (« Aucun compte ne passe ces filtres » — « Retirer les filtres »), jamais à lancer une analyse, ce qui n’a aucun rapport avec ce qui bloque réellement.',
      source: 'apps/web/src/features/accounts/view/AccountContent.tsx:654',
    },
    {
      kind: 'ecart',
      text: 'Le panneau latéral anime en 0,12 / 0,18 / 0,24 s — trois durées hors de la grammaire `DURATION` (0,16 · 0,26 · 0,4). À ramener sur `immediate` / `perceptible` (GA-25).',
      source: 'apps/web/src/features/accounts/view/AccountContent.tsx:895',
    },
    {
      kind: 'decision',
      text: 'Pas de bouton d’ajout manuel dans l’entête : on n’entre au portefeuille que par l’analyse (#2474, Louis 16/09/2026). La seule porte est « Analyser une entreprise » dans la barre d’outils.',
      source: 'apps/web/src/features/accounts/view/AccountsPage.tsx:412',
    },
    {
      kind: 'decision',
      text: 'L’état d’erreur CONSERVE les filtres : l’utilisateur relance sans refaire ses trois clics.',
      source: 'apps/web/src/features/accounts/view/AccountContent.tsx:731',
    },
    {
      kind: 'decision',
      text: 'RUX-15 (`docs/revue-ux.md` §4) : la règle « 2 premières colonnes » masquait « Prochaine action » sur téléphone — la seule colonne qui compte en mobilité, sixième et invisible. Le tableau déclare désormais un rôle mobile par colonne : « Compte » en `title`, « Prochaine action » en `meta` (elle reste visible sous 768 avec le nom du compte), les quatre autres en `field` (visibles de 768 à 1023 par priorité, repliées sous 768).',
      source: 'apps/web/src/features/accounts/view/accounts-list/AccountsTable.tsx:57',
    },
    {
      kind: 'decision',
      text: 'RUX-05/26 (`docs/revue-ux.md` §4, T12) : densité `comfort` — ligne 44 px, 14 px, cellules 12×8 — le défaut de l’app, jamais en dessous de 12 px (D80).',
      source: 'apps/web/src/features/accounts/view/accounts-list/AccountsTable.tsx:57',
    },
    {
      kind: 'decision',
      text: 'RUX-13 (`docs/revue-ux.md` §4, T5) : quatre mécanismes de filtrage empilés sur cet écran (des `Tabs` dans `actions`, un `TabNav` `pill` à 7 vues, des `FilterChips`, une `FilterBar`) deviennent DEUX niveaux — Vues (`intro`, `TabNav` `underline`, 5 au plus + « Plus de vues ▾ ») et Filtres (`filters`, `FilterBar` : « + Filtre », pastilles retirables, « Tout effacer », recherche à gauche). Les `Tabs` dans `actions` sont interdits : ce slot porte des verbes (« Analyser une entreprise »), jamais des sous-ensembles.',
      source: 'apps/web/src/features/accounts/view/accounts-list/AccountsToolbar.tsx:66',
    },
  ],
}
