import type { PageSpec } from '../../types'

/**
 * /consultants — le Vivier, vue « Talents » (les deux autres vues,
 * « Positionnements » et « À réveiller », sont des ONGLETS de cette même page
 * — `?view=`, jamais une route séparée pour le contenu).
 *
 * Lu dans : `apps/web/src/routes/consultants/index.tsx` → `VivierPage.tsx` →
 * `ConsultantsPage.tsx` (entête, trois vues, bandeau de stats, panneau
 * compétences manquantes, ajout/imports, filtres, sélection groupée, tableau
 * à 13 colonnes, pagination). Textes de
 * `apps/web/src/i18n/locales/fr/consultants.json`.
 */
export const consultantsPage: PageSpec = {
  id: 'app/consultants',
  surface: 'app',
  domain: 'consultants',
  route: 'apps/web/src/routes/consultants/index.tsx',
  title: 'Vivier',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ton vivier', style: 'title' },
      {
        type: 'text',
        text: 'Retrouve les consultants mobilisables, vérifie leur fraîcheur et vois où les positionner.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    intro: [
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'pill', items: ['Talents', 'Positionnements', 'À réveiller'] },
      },
      {
        type: 'grid',
        columns: 6,
        columnsMobile: 2,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Talents dans le vivier', value: '—' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Disponibles maintenant', value: '—' } },
          },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Profils enrichis', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Fiches incomplètes', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Profils favoris', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Mis à jour', value: '—' } } },
        ],
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', content: { label: 'Ajouter un consultant' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Importer une archive ZIP' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Importer depuis un e-mail' } },
      },
      { type: 'component', component: 'Button', props: { variant: 'outline', content: { label: 'Importer un CSV' } } },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          size: 'sm',
          items: ['Disponibles sous 30 jours', 'En intercontrat', 'Jamais positionnés', 'À recontacter', 'Candidats'],
        },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Nom ou intitulé de poste…' } },
          },
          {
            type: 'component',
            component: 'Select',
            props: { size: 'sm', content: { placeholder: 'Banque, Industrie…' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Plus de filtres' } },
          },
        ],
      },
    ],
    bulk: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Archiver la sélection' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Exporter la sélection (CSV)' } },
          },
        ],
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
              'Titre',
              'Compétences principales',
              'Séniorité',
              'Localisation',
              'Statut',
              'Disponibilité',
              'TJM',
              'Télétravail',
              'Contrat',
              'Complétude',
              'Dernière interaction',
              'Actions',
            ],
            rows: [
              [
                'Talent exemple 1',
                '—',
                '—',
                'Séniorité à préciser',
                '—',
                '—',
                'Non renseignée',
                '—',
                '—',
                'Non précisé',
                '—',
                '—',
                '—',
              ],
            ],
          },
        },
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: { title: 'Matching personnalisé', description: 'Rapprocher tes profils d’un besoin ouvert' },
        },
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
            title: 'Ton vivier est vide',
            description:
              'Ajoute tes consultants disponibles : c’est ce qui permet de pousser un profil sur un besoin, avec ses raisons et ses risques.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Fiche indisponible',
            description:
              'Impossible de charger cette fiche. Elle a peut-être été supprimée, ou la requête n’a pas abouti.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '#4197 (L6, 14/10/2026) : le Vivier est le deuxième onglet de Talents (Besoins ouverts · Vivier · Positionnements) ; la barre de vues `VivierViewTabs` est supprimée. `/consultants?view=submissions` redirige vers la section « Positionnements » du Vivier (#4349), `/consultants/pool` est réécrit vers ici (#3962, #4359).',
      source: 'apps/web/src/routes/consultants/index.tsx:101',
    },
    {
      kind: 'decision',
      text: 'Le contrôle « disponibilité inconnue » ne compte QUE les consultants, jamais les candidats — un espace sans consultant affiche le libellé sans population plutôt qu’un « 0 sur 0 » qui se lirait comme une panne au-dessus d’une liste non vide.',
      source: 'apps/web/src/features/consultants/view/ConsultantsPage.tsx:450',
    },
    {
      kind: 'ecart',
      text: 'Aucun bouton de suppression manuelle du filtre « Réveil » n’est doublé depuis #1803 (l’onglet de vue reste la SEULE porte) — mais avant ce correctif, le même geste existait à deux endroits distincts vers la même destination.',
      source: 'apps/web/src/features/consultants/view/ConsultantsPage.tsx:389',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, la barre de vues rapides (`FilterChips`) et la barre d’ajout/imports passent à la ligne (`flex-wrap`) ; le tableau à 13 colonnes défile horizontalement dans son conteneur (GA-119). Le panneau de matching (aside) ne se place à côté du tableau (`xl:flex-row`) qu’À PARTIR de 1280 px ET seulement s’il est ouvert — replié, il ne réserve aucune largeur, correctif mesuré (#2500 : 288 px réservés pour un aside vide). Au-delà de 1920 (2560/3440) : le tableau retombe volontairement sur son palier « lg » (dix colonnes) même à cette taille quand l’aside est ouvert, pour ne jamais déborder de la place restante — aucune quatorzième colonne n’apparaît jamais.',
      source: 'apps/web/src/features/consultants/view/ConsultantsPage.tsx:378',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : le chargement dessinait un texte brut plutôt qu’un `Skeleton` à la forme du contenu — trois composants d’état, pas un de plus, sur les trois surfaces ; `Loader2` en dur est interdit.',
      source: 'apps/web/src/routes/consultants/index.tsx:1',
    },
  ],
}
