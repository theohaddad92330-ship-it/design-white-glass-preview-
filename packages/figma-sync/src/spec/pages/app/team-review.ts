import type { PageSpec } from '../../types'

/**
 * /team/review/$step — le point d'équipe, en trois étapes : les sujets, les décisions, la relecture.
 * Une étape hors 1-3 ramène à la première ; un espace solo n'a pas de point d'équipe (→ l'état vide de /team).
 *
 * Lu dans : `apps/web/src/routes/team/review.$step.tsx` → `TeamReviewPage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/manager.json` (`review.*`).
 */
export const teamReviewPage: PageSpec = {
  id: 'app/team-review',
  surface: 'app',
  domain: 'team',
  route: 'apps/web/src/routes/team/review.$step.tsx',
  title: 'Le point d’équipe.',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Le point d’équipe.', style: 'title' },
      {
        type: 'text',
        text: 'Un court parcours pour transformer les constats en décisions.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    progress: [
      {
        type: 'text',
        text: 'Étape 1 / 3 — Les sujets · Les décisions · La relecture',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    primary: [
      { type: 'text', text: 'Que faut-il débloquer ensemble ?', style: 'title' },
      {
        type: 'text',
        text: 'Sélectionne les sujets du point. La sélection ne modifie aucune action.',
        style: 'caption',
        color: 'text/secondary',
      },
      { type: 'component', component: 'Checkbox', props: { content: { label: 'Une action à reprendre' } } },
      {
        type: 'component',
        component: 'Input',
        props: {
          content: { label: 'Un autre point à partager', placeholder: 'Un sujet, une décision, une question…' },
        },
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Quitter pour le moment' } },
      },
      { type: 'component', component: 'Button', props: { size: 'sm', content: { label: 'Continuer' } } },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Le point n’a pas pu être enregistré. Rien n’a changé.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Étape 2 « Qui fait quoi, et pour quand ? » : les actions existantes sont mises à jour, jamais dupliquées ; étape 3 « Un compte rendu qui mène à l’action » : aucun e-mail n’est envoyé et aucune affaire ne change d’étape. Un point peut aussi être enregistré sans nouvelle action.',
      source: 'apps/web/src/features/manager/view/TeamReviewPage.tsx:299',
    },
    {
      kind: 'decision',
      text: 'Même porte que `/team` : un espace de moins de deux membres est ramené à `/team`, une étape hors 1-3 à `/team/review/1`.',
      source: 'apps/web/src/features/manager/view/TeamReviewPage.tsx:119',
    },
  ],
}
