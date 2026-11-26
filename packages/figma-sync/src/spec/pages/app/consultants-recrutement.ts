import type { PageSpec } from '../../types'

/**
 * /consultants/recrutement — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/consultants/recrutement.tsx` → `RecruitmentPage.tsx`. Textes de `i18n/locales/fr/consultants.json (`recruitment.*`)`.
 */
export const consultantsRecrutementPage: PageSpec = {
  id: 'app/consultants-recrutement',
  surface: 'app',
  domain: 'consultants',
  route: 'apps/web/src/routes/consultants/recrutement.tsx',
  title: 'Recrutement',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Recrutement', style: 'title' },
      {
        type: 'text',
        text: 'La qualification de la personne, indépendamment de ses présentations chez les clients.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ajouter un profil' } },
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { content: { title: 'Rien à afficher pour l’instant' } },
      },
    ],
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
      text: 'Porte de plan (`PlanFeatureRoute`) : sans la fonction, l’écran est remplacé par l’invitation à changer de palier. Le recrutement qualifie la personne, jamais ses présentations chez un client.',
      source: 'apps/web/src/features/consultants/recruitment/RecruitmentPage.tsx:40',
    },
  ],
}
