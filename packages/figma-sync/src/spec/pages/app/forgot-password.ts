import type { PageSpec } from '../../types'

/**
 * /forgot-password — demande de lien de réinitialisation. Un état « email
 * envoyé » remplace le formulaire par une confirmation, sans quitter l’écran ;
 * le lien envoyé est à usage unique.
 *
 * Lu dans : `apps/web/src/routes/forgot-password.tsx` → `ForgotPasswordPage.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/auth.json` (clé `forgotPassword`).
 */
export const forgotPasswordPage: PageSpec = {
  id: 'app/forgot-password',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/forgot-password.tsx',
  title: 'Réinitialiser ton mot de passe',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [{ type: 'component', component: 'BrandMark', props: { size: 'md' } }],
    primary: [
      { type: 'text', text: 'Réinitialiser ton mot de passe', style: 'title' },
      {
        type: 'text',
        text: 'Indique l’adresse associée à ton compte. Nous t’enverrons un lien sécurisé.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'success',
          content: { title: 'Email envoyé', description: 'Consulte ton adresse, puis suis le lien reçu.' },
        },
      },
      { type: 'component', component: 'Input', props: { content: { label: 'Adresse email' } } },
      { type: 'component', component: 'Button', props: { content: { label: 'Envoyer le lien' } } },
      {
        type: 'text',
        text: 'Le lien est temporaire et ne peut être utilisé qu’une fois.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour à la connexion' } },
      },
    ],
  },
  states: {
    loading: [
      { type: 'component', component: 'Button', props: { state: 'loading', content: { label: 'Envoyer le lien' } } },
    ],
    error: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          content: {
            title: 'Impossible d’envoyer le lien pour le moment.',
            description: 'Réessaie dans quelques instants.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Après un envoi, le bouton passe en compte à rebours (« Réessayer dans {{seconds}}s ») plutôt que de rester actif — un second envoi immédiat ne renverrait qu’un lien qui invaliderait le premier.',
      source: 'apps/web/src/i18n/locales/fr/auth.json:93',
    },
    {
      kind: 'decision',
      text: 'Responsive : le formulaire est borné à `max-w-xl` de 360 à 1920 px, une seule colonne à toutes les largeurs. Au-delà (2560, 3440), on n’étire jamais la carte : la maquette cible un fond illustré plus large autour, jamais un champ email à pleine largeur d’écran.',
      source: 'apps/web/src/features/auth/view/ForgotPasswordPage.tsx:69',
    },
  ],
}
