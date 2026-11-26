import type { PageSpec } from '../../types'

/**
 * /projects/presentations — Affaires › Présentations : un consultant, un besoin et une histoire distincte.
 * `?project=` filtre sur UNE affaire. Aucun envoi ne se déduit d'un déplacement de carte.
 *
 * Lu dans : `apps/web/src/routes/projects/presentations.tsx` → `PresentationsPage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/submissions.json` (`presentations.*`).
 */
export const projectsPresentationsPage: PageSpec = {
  id: 'app/projects-presentations',
  surface: 'app',
  domain: 'projects',
  route: 'apps/web/src/routes/projects/presentations.tsx',
  title: 'Présentations',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Présentations', style: 'title' },
      {
        type: 'text',
        text: 'Un consultant, un besoin et une histoire distincte. Aucun envoi ne se déduit d’un déplacement de carte.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    actions: [
      { type: 'component', component: 'Button', props: { size: 'sm', content: { label: 'Ajouter une présentation' } } },
    ],
    intro: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 1,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Présélectionnés', value: '30 derniers jours' } },
          },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Présentés', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'En entretien', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Retenus', value: '—' } } },
        ],
      },
    ],
    filters: [{ type: 'component', component: 'Select', props: { size: 'sm', content: { placeholder: 'En cours' } } }],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Consultant', 'Besoin / client', 'Suivi', 'Canal / responsable', 'Prochaine échéance', 'Ouvrir'],
            rows: [
              [
                'Consultant exemple 1',
                'Besoin exemple 1',
                'Pas encore présentée',
                'Canal non renseigné',
                'À préciser',
                'Ouvrir',
              ],
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
            title: 'Aucune présentation pour l’instant',
            description: 'Ajoute une présentation, ou affiche tous les états.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Les présentations n’ont pas pu être chargées' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une valeur absente ne s’écrit jamais « 0 » : une tuile du tunnel sans mesure affiche « — », et « Canal non renseigné » / « À préciser » disent ce qui manque plutôt que de l’inventer (GA-18/19).',
      source: 'apps/web/src/features/submissions/view/PresentationsPage.tsx:139',
    },
    {
      kind: 'decision',
      text: 'Même palier que le pipe (`feature="needs"`) : une clé de palier neuve sans migration rendrait 403 pour tout le monde. Un identifiant `?project=` abîmé ouvre la liste entière plutôt qu’une erreur.',
      source: 'apps/web/src/features/submissions/view/PresentationsPage.tsx:32',
    },
  ],
}
