import type { PageSpec } from '../../types'

/**
 * /missions/planification — la frise : qui est sur quelle mission, et jusqu'à
 * quand. Une fin qu'on ne connaît pas ne se dessine pas comme une fin.
 *
 * Lu dans : `apps/web/src/routes/missions/planification.tsx` →
 * `PlanningPage.tsx` (recherche, facettes, filtres, navigation de fenêtre,
 * frise à un seul conteneur défilant, panneaux « sans date »/« hors
 * fenêtre »/« dates à corriger »). Textes de
 * `apps/web/src/i18n/locales/fr/missions.json` (`planning`).
 */
export const missionsPlanificationPage: PageSpec = {
  id: 'app/missions-planification',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/planification.tsx',
  title: 'Planification',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Planification de l’équipe', style: 'title' },
      {
        type: 'text',
        text: 'Visualise les consultants engagés, les prochains démarrages et les disponibilités à venir.',
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
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher une mission, un compte, un consultant…' } },
          },
          {
            type: 'component',
            component: 'FilterChips',
            props: { size: 'sm', items: ['Démarrages', 'Échéances', 'Sans date de fin'] },
          },
          { type: 'component', component: 'Select', props: { size: 'sm', content: { label: 'Consultant' } } },
          { type: 'component', component: 'Select', props: { size: 'sm', content: { label: 'Compte' } } },
          { type: 'component', component: 'Select', props: { size: 'sm', content: { label: 'Statut' } } },
          { type: 'component', component: 'Checkbox', props: { content: { label: 'Inclure les missions terminées' } } },
        ],
      },
    ],
    kpis: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Missions sur la fenêtre', value: '—' } },
          },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Démarrages', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Échéances', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Sans date de fin', value: '—' } } },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Finissent sous 30 jours', value: '—' } },
          },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Conflits', value: '—' } } },
        ],
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Fenêtre précédente' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Aujourd’hui' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Fenêtre suivante' } },
      },
      { type: 'component', component: 'Select', props: { size: 'sm', content: { label: 'Durée affichée' } } },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: 'Demander à Laura sur mon planning' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Gantt',
        props: {
          content: { today: 'Aujourd’hui', availability: 'Disponibilité' },
          items: ['—'],
        },
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Sans date exploitable',
            description:
              'Ni démarrage ni fin. Les poser à gauche de la frise leur donnerait une date que personne n’a saisie.',
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Dates à corriger',
            description:
              'La fin précède le démarrage. Rien n’est dessiné : une barre à l’envers ne se voit pas, et ne dit rien.',
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
            title: 'Rien à planifier sur ces mois',
            description:
              'Aucune mission ne couvre la fenêtre. Elles se sont terminées avant, ou n’ont pas encore commencé.',
            action: 'Revenir à aujourd’hui',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Le planning n’a pas pu être chargé' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une fin inconnue ne se dessine jamais comme une échéance : le bord droit d’une barre sans date de fin reste ouvert, jamais une fausse limite dessinée.',
      source: 'apps/web/src/i18n/locales/fr/missions.json:1355',
    },
    {
      kind: 'decision',
      text: 'Responsive : la frise défile horizontalement dans SON SEUL conteneur (`overflow-x-auto`, largeur minimale 64rem/1024px) — jamais la page — car les deux colonnes latérales laisseraient sinon moins de 4rem par mois, illisible ; la colonne de gauche fait 14rem sous 768 px (`w-56`) et passe à 16rem à partir de 768 px (`md:w-64`). Au-delà de 1920 (2560/3440) : plus de mois deviennent visibles sans défiler (gain réel), mais les colonnes latérales ne s’élargissent jamais.',
      source: 'apps/web/src/features/missions/view/PlanningPage.tsx:788',
    },
  ],
}
