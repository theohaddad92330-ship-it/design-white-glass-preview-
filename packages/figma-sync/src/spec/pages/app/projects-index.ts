import type { PageSpec } from '../../types'

/**
 * /projects — « Pipe », premier onglet d’Affaires (vue commerciale, kanban à
 * cinq étapes). #4197 (L6, 14/10/2026) : la seconde lentille, « Pistes », a
 * quitté cet écran (#4340 : `/mes-cibles#pistes`) et `/projects?lens=portfolio` y redirige ; le
 * CA probable a quitté cet écran pour Pilotage › Pipe (`app/pilotage-pipe`).
 *
 * Lu dans : `apps/web/src/routes/projects/index.tsx` → `ProjectsPage.tsx`
 * (`PipelineLens` avec la barre du cockpit à cinq colonnes, kanban/tableau,
 * filtres owner/compte/sans prochaine action). Textes de
 * `apps/web/src/i18n/locales/fr/projects.json`.
 */
export const projectsIndexPage: PageSpec = {
  id: 'app/projects-index',
  surface: 'app',
  domain: 'projects',
  route: 'apps/web/src/routes/projects/index.tsx',
  title: 'Pipe',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'pill', items: ['Pipe', 'Pistes', 'Appels d’offres'] },
      },
      { type: 'text', text: 'Ton activité commerciale, {{firstName}}.', style: 'title' },
      {
        type: 'text',
        text: 'Vois ce qui avance, ce qui bloque et les pistes qui méritent d’être qualifiées.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    intro: [
      {
        type: 'text',
        text: '3 pistes à revoir → Pistes',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Demander à Laura' } } },
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          size: 'md',
          items: [
            'Qualifié — 12 · 340 k€',
            'Besoin exprimé — 8 · 210 k€',
            'Profils présentés — 5 · 180 k€',
            'Négociation — 3 · 95 k€',
            'Signé — 2 · 60 k€',
          ],
        },
      },
    ],
    actions: [
      { type: 'component', component: 'ModeTabs', props: { items: ['Kanban', 'Tableau'] } },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher un compte' } },
          },
          {
            type: 'component',
            component: 'FilterChips',
            props: { size: 'sm', items: ['Responsable', 'Sans prochaine action'] },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Créer une affaire' } },
          },
        ],
      },
    ],
    primary: [
      {
        type: 'placeholder',
        kind: 'custom',
        label:
          'Kanban à 5 colonnes (Qualifié, Besoin exprimé, Profils présentés, Négociation, Signé), une carte par affaire avec montant, âge d’étape et prochaine action',
        height: 'lg',
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
            title: 'Aucune affaire dans le pipe',
            description: 'Crée une affaire depuis un besoin qualifié, ou ouvre les pistes à qualifier.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Le pipe n’a pas pu être chargé', description: 'Réessaie dans un instant.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le kanban commence à moins de 600 px du haut (recette 15/10, #4191). Le bloc « Détecté, à revoir » a quitté le Pipe pour l’onglet Pistes ; il n’en reste qu’UNE ligne-lien « N pistes à revoir → Pistes », absente quand N = 0 (on n’affiche pas ce qu’on n’a pas). Les quatre tuiles tiennent sur une rangée dès 1024 px.',
      source: 'apps/web/src/features/projects/view/ProjectsPage.tsx:479',
    },
    {
      kind: 'decision',
      text: 'Aucune pastille « Étape » dans les filtres rapides : le tableau EST fait de colonnes d’étapes, et la barre du cockpit pose déjà `?stage=` — une rangée de pastilles au-dessus de cinq colonnes portant les mêmes cinq mots serait la loi 4 du tome 7 enfreinte.',
      source: 'apps/web/src/features/projects/view/ProjectsPage.tsx:241',
    },
    {
      kind: 'decision',
      text: 'Le switch Kanban/Tableau vit dans un état local, pas dans l’URL : aucun lien distant ne désigne « le pipe en tableau », et une clé d’URL que personne n’écrit devient une clé morte à porter indéfiniment.',
      source: 'apps/web/src/features/projects/view/ProjectsPage.tsx:238',
    },
    {
      kind: 'decision',
      text: 'Créer une affaire est toujours un geste humain sur un formulaire pré-rempli, jamais une écriture automatique : un lien (ex. depuis le panneau de renouvellement) ouvre le formulaire avec compte et mission déjà connus, mais c’est le clic sur « créer » qui décide.',
      source: 'apps/web/src/features/projects/view/ProjectsPage.tsx:96',
    },
    {
      kind: 'decision',
      text: 'Responsive : les onglets de vue (`TabNav`) défilent horizontalement sous 768 px plutôt que de s’empiler ou de tronquer leurs libellés. La barre du cockpit (5 colonnes chiffrées) passe de défilement horizontal sur mobile à 5 colonnes visibles sans défilement à partir de la tablette (768-1194). Au-delà de 1920 px (2560, 3440) : le kanban GAGNE en largeur de colonne (les cartes montrent montant + âge + prochaine action sur une seule ligne au lieu de les empiler), mais jamais une 6ᵉ colonne — les cinq étapes du contrat (`PIPELINE_STAGES`) restent la seule vérité, une largeur d’écran ne crée pas d’étape.',
      source: 'apps/web/src/features/projects/view/ProjectsPage.tsx:24',
    },
  ],
}
