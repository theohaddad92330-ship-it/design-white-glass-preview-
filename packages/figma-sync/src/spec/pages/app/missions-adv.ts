import type { PageSpec } from '../../types'

/**
 * /missions/adv — Administration des ventes : ce qui manque pour qu'une
 * mission puisse démarrer ou être reconduite.
 *
 * Lu dans : `apps/web/src/routes/missions/adv.tsx` → `AdvPage.tsx` (entête,
 * six tuiles cliquables qui filtrent, recherche, tableau des dossiers).
 * Textes de `apps/web/src/i18n/locales/fr/adv.json`.
 */
export const missionsAdvPage: PageSpec = {
  id: 'app/missions-adv',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/adv.tsx',
  title: 'Administration des ventes',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Administration des ventes', style: 'title' },
      {
        type: 'text',
        text: 'Ce qui manque pour qu’une mission puisse démarrer ou être reconduite. Une ligne par dossier, son motif, et l’écran où tu le règles.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          { type: 'component', component: 'Select', props: { size: 'sm', content: { label: 'Mois observé' } } },
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Client, mission…' } },
          },
        ],
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 6,
        columnsMobile: 2,
        gap: '2',
        children: [
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Tous', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Démarrages', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Renouvellements', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'En cours', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'À facturer', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'En négociation', value: '—' } } },
        ],
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Exporter' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Client',
              'Mission',
              'Dossier',
              'Ancienneté',
              'Ce qui manque',
              'Règlement',
              'Coordonnées transmises',
            ],
            rows: [
              ['Compte exemple 1', 'Mission exemple 1', 'Démarrage', '—', 'Contact de facturation manquant', '—', '—'],
              ['Compte exemple 2', 'Mission exemple 2', 'Renouvellement', '—', 'Bon de commande manquant', '—', '—'],
            ],
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
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Aucun dossier à traiter sur cette sélection.',
            description:
              'Les démarrages du mois et les renouvellements à venir apparaissent ici. Change de mois ou retire un filtre pour élargir.',
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
            title: 'La liste n’a pas pu être chargée',
            description: 'Ce n’est pas « aucun dossier à traiter » : réessaie dans un instant.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un motif « non mesuré » se dit en toutes lettres (ex. KYC non calculé) plutôt que de compter 0 — une absence de mesure n’est jamais confondue avec « rien à vérifier ».',
      source: 'apps/web/src/i18n/locales/fr/adv.json:73',
    },
    {
      kind: 'decision',
      text: 'Responsive : les six tuiles passent de 2 colonnes sous 768 px à 3 (tablette 768-1194) puis 6 à partir de 1024 px (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`) ; le tableau défile horizontalement dans son conteneur (GA-119) sans masquer de colonne. Au-delà de 1920 (2560/3440) : aucun gain, ni septième tuile ni panneau — la grille et le tableau s’étirent (`page-gutter.ts` sans `max-w-*`).',
      source: 'apps/web/src/features/adv/view/AdvPage.tsx:154',
    },
  ],
}
