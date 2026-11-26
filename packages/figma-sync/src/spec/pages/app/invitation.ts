import type { PageSpec } from '../../types'

/**
 * /invitation/$token — accepter une invitation à rejoindre un espace de
 * travail. Quatre états séquentiels : pas connecté (invite à se connecter ou
 * créer un compte avec l’email invité), acceptation en cours, succès (nom de
 * l’espace et rôle), ou erreur (invitation indisponible).
 *
 * Lu dans : `apps/web/src/routes/invitation/$token.tsx` → `AcceptInvitationView.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/team.json` (clé `accept`).
 */
export const invitationPage: PageSpec = {
  id: 'app/invitation',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/invitation/$token.tsx',
  title: 'Rejoindre l’équipe',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    primary: [
      { type: 'text', text: 'Rejoindre l’équipe', style: 'title' },
      {
        type: 'text',
        text: 'Connecte-toi à BellumAI pour accepter cette invitation. Utilise l’adresse email à laquelle l’invitation a été envoyée.',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'component', component: 'Button', props: { content: { label: 'Se connecter' } } },
      { type: 'text', text: 'Pas encore de compte ?', style: 'caption', color: 'text/secondary' },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Créer un compte' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Invitation indisponible', description: 'L’invitation n’a pas pu être acceptée' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Retour à l’application' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le succès affiche le NOM DE L’ESPACE et le RÔLE attribué (« Tu as rejoint l’équipe en tant que {{role}} ») — jamais un simple « Bienvenue » générique, pour que la personne sache exactement ce qu’elle vient de rejoindre.',
      source: 'apps/web/src/features/team/view/AcceptInvitationView.tsx:127',
    },
    {
      kind: 'decision',
      text: 'Responsive : la carte centrale (`max-w-md`) est identique de 360 à 1920 px, un seul état affiché à la fois. Au-delà (2560, 3440), on n’étire jamais la carte : la maquette cible un fond illustré plus large autour plutôt qu’une carte d’acceptation démesurément agrandie.',
      source: 'apps/web/src/features/team/view/AcceptInvitationView.tsx:74',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : `BrailleLoader` est réservé à l’attente longue d’une analyse et nulle part ailleurs — accepter une invitation est rapide, l’écran dessine désormais `Skeleton` sans texte brut à côté.',
      source: 'apps/web/src/features/team/view/AcceptInvitationView.tsx:1',
    },
  ],
}
