import type { PageSpec } from '../../types'

/**
 * /team/member.$id — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/team/member.$id.tsx` → `TeamMemberPage.tsx`. Textes de `i18n/locales/fr/manager.json (`team.member.*`)`.
 */
export const teamMemberPage: PageSpec = {
  id: 'app/team-member',
  surface: 'app',
  domain: 'team',
  route: 'apps/web/src/routes/team/member.$id.tsx',
  title: 'Fiche d’un membre',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Fiche d’un membre', style: 'title' },
      {
        type: 'text',
        text: 'Ses objectifs, ses comptes suivis, ses affaires ouvertes et ses prochaines actions.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Fiche d’un membre' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Cet écran n’a pas pu se charger. Rien n’a changé.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un membre absent de l’espace donne « Impossible d’ouvrir cette fiche » et un lien de retour vers toute l’équipe, jamais une fiche vide.',
      source: 'apps/web/src/features/manager/team/TeamMemberPage.tsx:41',
    },
  ],
}
