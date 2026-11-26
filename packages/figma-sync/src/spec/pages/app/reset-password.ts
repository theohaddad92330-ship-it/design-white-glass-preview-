import type { PageSpec } from '../../types'

/**
 * /auth/reset-password — définition d’un nouveau mot de passe (arrivée depuis
 * le lien à usage unique de `/forgot-password`). Appliqué immédiatement.
 *
 * Lu dans : `apps/web/src/routes/auth/reset-password.tsx` → `ResetPasswordPage.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/auth.json` (clé `resetPassword`).
 */
export const resetPasswordPage: PageSpec = {
  id: 'app/reset-password',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/auth/reset-password.tsx',
  title: 'Définir un nouveau mot de passe',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [{ type: 'component', component: 'BrandMark', props: { size: 'md' } }],
    primary: [
      { type: 'text', text: 'Définir un nouveau mot de passe', style: 'title' },
      {
        type: 'text',
        text: 'Choisis un mot de passe robuste pour sécuriser ton compte.',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'component', component: 'PasswordField', props: { content: { label: 'Nouveau mot de passe' } } },
      { type: 'component', component: 'PasswordField', props: { content: { label: 'Confirmer le mot de passe' } } },
      { type: 'text', text: '8 caractères minimum', style: 'caption', color: 'text/muted' },
      { type: 'component', component: 'Button', props: { content: { label: 'Enregistrer' } } },
      {
        type: 'text',
        text: 'Ton nouveau mot de passe sera appliqué immédiatement.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
  },
  states: {
    loading: [
      { type: 'component', component: 'Button', props: { state: 'loading', content: { label: 'Enregistrer' } } },
    ],
    error: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: { variant: 'danger', content: { title: 'Les mots de passe ne correspondent pas.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Aucune donnée de l’ancien mot de passe n’est demandée : la seule preuve d’identité est le lien à usage unique reçu par email, déjà consommé pour atteindre cet écran.',
      source: 'apps/web/src/routes/auth/reset-password.tsx:4',
    },
    {
      kind: 'decision',
      text: 'Responsive : le formulaire (deux champs mot de passe) est en une colonne à toutes les largeurs, borné en largeur — mobile, tablette et bureau identiques. Au-delà de 1920 (2560, 3440), la maquette cible une illustration de sécurité à côté du formulaire plutôt qu’un formulaire isolé dans un vide démesuré.',
      source: 'apps/web/src/features/auth/view/ResetPasswordPage.tsx:102',
    },
  ],
}
