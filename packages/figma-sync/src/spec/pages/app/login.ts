import type { PageSpec } from '../../types'

/**
 * /login — connexion par mot de passe, Google, ou code par email (bascule),
 * avec relais MFA à six chiffres si le compte l’exige. Le panneau de marque
 * (bénéfices, mini-pipeline) n’apparaît qu’à partir de 1024 px.
 *
 * Lu dans : `apps/web/src/routes/login.tsx` → `LoginPage.tsx` (compose
 * `AuthBrandingPanel` + `LoginCard`). Textes de
 * `apps/web/src/i18n/locales/fr/auth.json` (clés `login`, `branding`).
 */
export const loginPage: PageSpec = {
  id: 'app/login',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/login.tsx',
  title: 'Se connecter',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [
      { type: 'component', component: 'BrandMark', props: { size: 'lg' } },
      {
        type: 'component',
        component: 'Badge',
        props: { variant: 'primary', content: { label: 'Dossiers de conquête B2B' } },
      },
      { type: 'text', text: 'Priorise les bons comptes, puis passe à l’action.', style: 'display' },
      {
        type: 'text',
        text: 'BellumAI consolide signaux, contacts et plans d’approche dans une interface pensée pour les équipes commerciales qui travaillent leurs comptes chaque jour.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Pipeline prioritaire' } },
        children: [
          {
            type: 'grid',
            columns: 3,
            columnsMobile: 1,
            gap: '2',
            children: [
              { type: 'text', text: '12 comptes', style: 'label' },
              { type: 'text', text: '38 contacts', style: 'label' },
              { type: 'text', text: '7 actions', style: 'label' },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Dossier complet sur tes comptes cibles en moins de 5 minutes.', value: '' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Contacts décideurs enrichis et priorisés automatiquement.', value: '' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Messages d’approche contextualisés, prêts à envoyer.', value: '' } },
          },
        ],
      },
    ],
    primary: [
      { type: 'text', text: 'Se connecter', style: 'title' },
      {
        type: 'text',
        text: 'Accède à tes comptes, contacts et plans d’action.',
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
        type: 'component',
        component: 'Input',
        props: { content: { label: 'Email', placeholder: 'tu@entreprise.com' } },
      },
      { type: 'component', component: 'PasswordField', props: { content: { label: 'Mot de passe' } } },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Mot de passe oublié ?' } },
      },
      { type: 'component', component: 'Button', props: { content: { label: 'Se connecter' } } },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', content: { label: 'Recevoir un code par email' } },
      },
      { type: 'text', text: 'Pas encore de compte ? S’inscrire', style: 'caption', color: 'text/secondary' },
    ],
  },
  states: {
    loading: [
      { type: 'component', component: 'Button', props: { state: 'loading', content: { label: 'Connexion...' } } },
    ],
    error: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: { variant: 'danger', content: { title: 'Email ou mot de passe incorrect.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un compte dont l’email n’est pas encore vérifié reçoit un message dédié (« Vérifie ton email pour activer ton compte ») plutôt que le message générique d’identifiants incorrects — les deux échecs n’appellent pas le même geste.',
      source: 'apps/web/src/i18n/locales/fr/auth.json:37',
    },
    {
      kind: 'ecart',
      text: 'Le panneau de marque (`AuthBrandingPanel`) est masqué sous `lg` (1024 px) — `hidden lg:flex` — alors que le reste du dépôt tient sa seule bascule mobile/desktop à 768 px (GA-28). Entre 768 et 1023 px (tablette), l’écran de connexion est donc à une seule colonne quand la plupart des autres écrans sont déjà en disposition « bureau ».',
      source: 'apps/web/src/features/auth/components/AuthBrandingPanel.tsx:11',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 1024 px, seule la carte de connexion est visible (le panneau de marque disparaît) ; de 1024 à 1920 px, la grille est `lg:grid-cols-2` (marque à gauche, carte à droite). Au-delà (2560, 3440), on n’étire jamais la carte de connexion (`max-w-md`) ni le panneau de marque (`max-w-xl`) : la maquette cible plus d’espace neutre de part et d’autre, jamais un formulaire de connexion à pleine largeur.',
      source: 'apps/web/src/features/auth/view/LoginPage.tsx:10',
    },
  ],
}
