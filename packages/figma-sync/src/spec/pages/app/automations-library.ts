import type { PageSpec } from '../../types'

/**
 * /actions/automatisations/bibliotheque — la bibliothèque de routines (Théo C automations-bibliotheque) : « Des suivis
 * prêts à adapter ». Lu dans `apps/web/src/routes/actions/automatisations_/bibliotheque.tsx` → `RoutineLibraryPage.tsx` :
 * entête et « Décrire mon besoin », sous-onglets avec compteurs, recherche + famille métier, cartes (famille, état,
 * outils lus), « Afficher les suivants » par douze, repli « Relances automatiques et lancement », puis la fenêtre
 * « Voir le fonctionnement » (`RoutineFunctioningDialog.tsx`) à deux onglets. Textes de
 * `apps/web/src/i18n/locales/fr/routines.json` (`lib.*`, `fn.*`).
 */
export const automationsLibraryPage: PageSpec = {
  id: 'app/automations-library',
  surface: 'app',
  domain: 'actions',
  route: 'apps/web/src/routes/actions/automatisations_/bibliotheque.tsx',
  title: 'Bibliothèque de routines',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Des suivis prêts à adapter', style: 'title' },
      {
        type: 'text',
        text: 'Choisis le résultat que tu veux obtenir. Laura t’aide ensuite à régler le périmètre et les étapes.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Décrire mon besoin' } },
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['Toutes', 'Organisation', 'Rendez-vous'] },
      },
    ],
    primary: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Préparation des rendez-vous' } },
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Fins de mission à trente jours' } },
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Consultants en intercontrat' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Afficher les suivants' } },
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
          content: { title: 'Aucune routine ne correspond à cette recherche.', action: 'Tout afficher' },
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
          content: { title: 'Les routines n’ont pas pu être chargées', description: 'Réessayer' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un outil non branché se dit « à connecter » sur la carte : le produit dit vraiment si le connecteur l’est, il ne laisse pas croire que la routine surveille quelque chose.',
      source: 'apps/web/src/features/routines/view/RoutineLibraryPage.tsx:1',
    },
    {
      kind: 'decision',
      text: 'Les outils se nomment par leur capacité (ta messagerie, ton agenda…), jamais par un éditeur (GA-44).',
      source: 'apps/web/src/features/routines/routineFamilies.ts:1',
    },
  ],
}
