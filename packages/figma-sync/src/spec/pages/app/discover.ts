import type { PageSpec } from '../../types'

/**
 * /discover — trouver de nouveaux comptes, personnes, besoins, partenaires
 * ou listes d'appel. Cinq TYPES DE RÉSULTAT pour une même recherche
 * (#2165.7-10) : `accounts` en tête (la seule lecture d'origine), puis
 * `contacts`, `needs`, `partners`, `calls` — chacun une LECTURE de ce que la
 * même recherche a déjà trouvé, jamais une source nouvelle.
 *
 * Lu dans : `apps/web/src/routes/discover/index.tsx` → `Discover.tsx`
 * (rail de filtres, sélecteur de type de résultat, tableau, export). Textes :
 * `apps/web/src/i18n/locales/fr/discover.json`.
 *
 * Le tableau de la maquette montre le type `accounts` (le défaut à
 * l'ouverture) avec neuf des quinze colonnes exportables — voir `uxNotes`
 * pour les six restantes (export uniquement).
 */
export const discoverPage: PageSpec = {
  id: 'app/discover',
  surface: 'app',
  domain: 'discover',
  route: 'apps/web/src/routes/discover/index.tsx',
  title: 'Trouver de nouveaux comptes',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Trouver de nouveaux comptes', style: 'title' },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Analyser une liste' } },
      },
    ],
    intro: [
      {
        type: 'component',
        component: 'TabNav',
        props: {
          variant: 'pill',
          items: ['Comptes', 'Contacts', 'Besoins et signaux', 'Partenaires', 'Liste d’appels'],
        },
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterBar',
        props: { items: ['Classe d’accès', 'Secteurs', 'Département', 'Tranche d’effectif', 'Mots-clés'] },
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          size: 'sm',
          items: ['A — Ouvert probable', 'B — Ouvert par une entité', 'C — Semi-ouvert', 'D — Verrouillage probable'],
        },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Nom',
              'Secteur',
              'Ville',
              'Département',
              'Tranche d’effectif',
              'Score',
              'Nombre de signaux',
              'État portefeuille',
              'Sources',
            ],
            rows: [
              ['Entreprise exemple 1', '—', '—', '—', '—', '—', '—', '—', '—'],
              ['Entreprise exemple 2', '—', '—', '—', '—', '—', '—', '—', '—'],
              ['Entreprise exemple 3', '—', '—', '—', '—', '—', '—', '—', '—'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Exporter vers une feuille' } },
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ta demande, telle qu’elle a été appliquée' } },
        children: [
          { type: 'text', text: 'Résultats filtrés sur le secteur « Services numériques ».', style: 'body' },
          {
            type: 'text',
            text: 'Non pris en compte : « rentable » — ce critère ne se lit pas dans le registre.',
            style: 'caption',
            color: 'text/muted',
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
            title: 'Des entreprises n’ont pas pu être identifiées',
            description:
              'Plusieurs entités du registre portent le même nom et aucune ne s’impose. Elles sont écartées plutôt que rattachées au hasard : aucun SIREN n’est inventé.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger les résultats.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un SEUL type de résultat par recherche, porté par l’URL (pas un `useState` par type qui permettrait d’en allumer deux) — une recherche qui ne se partage ni ne se retrouve n’est pas une recherche.',
      source: 'packages/contracts/src/schemas/discover-result-type.ts:30',
    },
    {
      kind: 'decision',
      text: 'Les six colonnes restantes de l’export (Code NAF, Date de création, Confiance, Fort potentiel, Dernier signal, Score maximum mesuré) n’apparaissent que dans la feuille exportée, jamais dans le tableau à l’écran — neuf colonnes tiennent lisiblement, quinze non.',
      source: 'apps/web/src/i18n/locales/fr/discover.json:940',
    },
    {
      kind: 'decision',
      text: 'Une entreprise ambiguë (plusieurs entités du registre portant le même nom) est ÉCARTÉE plutôt que rattachée au hasard — jamais un SIREN deviné, même en état vide.',
      source: 'apps/web/src/i18n/locales/fr/discover.json:1142',
    },
    {
      kind: 'decision',
      text: 'Un critère de la phrase libre qui ne se lit pas dans le registre (ex. « rentable ») se NOMME comme non pris en compte, dans l’aside — jamais silencieusement ignoré.',
      source: 'apps/web/src/i18n/locales/fr/discover.json:1153',
    },
    {
      kind: 'decision',
      text: 'Responsive : le sélecteur de type de résultat (cinq pastilles) s’enroule en lignes (`flex-wrap`) dès 360 px, jamais un menu déroulant. L’aside « Ta demande appliquée » n’est visible en panneau qu’à partir de 1280 px ; en dessous, il passe sous le tableau. Le tableau à neuf colonnes défile horizontalement dans son propre conteneur sous 1024 px. Au-delà de 1920, le tableau garde ses colonnes lisibles et l’aside reste à largeur fixe plutôt que de s’étirer.',
      source: 'apps/web/src/features/discover/view/Discover.tsx:1812',
    },
  ],
}
