import type { PageSpec } from '../../types'

/**
 * /signup — création de compte : Google ou formulaire (prénom, nom, email, mot
 * de passe, confirmation, acceptation des conditions). Pas de panneau de
 * marque ici (contrairement à `/login`), juste la marque en entête.
 *
 * Lu dans : `apps/web/src/routes/signup.tsx` → `SignupPage.tsx` →
 * `SignupCard.tsx`. Textes de `apps/web/src/i18n/locales/fr/auth.json` (clé
 * `signup`).
 */
export const signupPage: PageSpec = {
  id: 'app/signup',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/signup.tsx',
  title: 'Créer un compte',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [{ type: 'component', component: 'BrandMark', props: { size: 'md' } }],
    primary: [
      { type: 'text', text: 'Créer un compte', style: 'title' },
      {
        type: 'text',
        text: 'Intelligence commerciale pour ESN, prête à l’emploi en 5 minutes.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Continuer avec Google' } },
      },
      { type: 'text', text: 'ou', style: 'caption', color: 'text/muted' },
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '3',
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'Prénom', placeholder: 'Jean' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Nom', placeholder: 'Dupont' } } },
        ],
      },
      {
        type: 'component',
        component: 'Input',
        props: { content: { label: 'Email', placeholder: 'tu@entreprise.com' } },
      },
      { type: 'component', component: 'PasswordField', props: { content: { label: 'Mot de passe' } } },
      { type: 'component', component: 'PasswordField', props: { content: { label: 'Confirmer le mot de passe' } } },
      {
        type: 'component',
        component: 'Checkbox',
        props: { content: { label: 'J’accepte les conditions d’utilisation et la politique de confidentialité' } },
      },
      { type: 'component', component: 'Button', props: { content: { label: 'Créer mon compte' } } },
      { type: 'text', text: 'Déjà un compte ? Se connecter', style: 'caption', color: 'text/secondary' },
    ],
  },
  states: {
    loading: [
      { type: 'component', component: 'Button', props: { state: 'loading', content: { label: 'Création...' } } },
    ],
    error: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          content: {
            title: 'Un compte existe déjà avec cet email.',
            description: 'Connecte-toi ou utilise un autre email.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un compte créé avec succès n’ouvre jamais directement l’application : il mène soit à un message « Compte créé ! », soit — quand la vérification est exigée — droit sur la saisie du code envoyé par email, jamais un entre-deux silencieux.',
      source: 'apps/web/src/i18n/locales/fr/auth.json:71',
    },
    {
      kind: 'decision',
      text: 'Responsive : les deux champs Prénom/Nom (Grid 2 colonnes) passent à 1 colonne sous 768 px. Le formulaire entier reste borné à `max-w-md` de 768 à 1920 px. Au-delà (2560, 3440), on n’étire jamais le formulaire : la maquette cible un panneau de marque à droite (comme `/login`) plutôt qu’un formulaire centré démesurément isolé dans le vide.',
      source: 'apps/web/src/features/auth/view/SignupPage.tsx:9',
    },
  ],
}
