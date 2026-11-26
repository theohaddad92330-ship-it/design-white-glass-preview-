import type { PageSpec } from '../../types'

/**
 * `/login` — connexion au back-office (#1668) : e-mail, mot de passe, code TOTP
 * à six chiffres, et l'enrôlement de la première application d'authentification
 * quand le serveur répond « aucun facteur ». Trois BRANCHES serveur en amont du
 * formulaire (éteinte / mal configurée / active) — la maquette montre la
 * branche active, les deux autres en `uxNotes`.
 *
 * Lu dans : `src/app/login/page.tsx` → `_components/login-form.tsx`.
 */
export const loginPage: PageSpec = {
  id: 'dm/login',
  surface: 'dm',
  domain: 'auth',
  route: 'apps/dashboard-manager/src/app/login/page.tsx',
  title: 'Connexion',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    primary: [
      { type: 'text', text: 'Connexion', style: 'title' },
      {
        type: 'text',
        text: 'La console du back-office demande ton adresse, ton mot de passe et le code à six chiffres de ton application d’authentification. Seules les adresses autorisées entrent.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Card',
        props: {},
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'Adresse e-mail' } } },
          { type: 'component', component: 'PasswordField', props: { content: { label: 'Mot de passe' } } },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Code à six chiffres' }, state: 'default' },
          },
          {
            type: 'text',
            text: 'Laisse ce champ vide si tu n’as pas encore enrôlé d’application d’authentification.',
            style: 'caption',
            color: 'text/muted',
          },
          { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Se connecter' } } },
        ],
      },
    ],
  },
  states: {
    loading: [
      {
        type: 'component',
        component: 'Card',
        props: {},
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', state: 'loading', content: { label: 'Vérification…' } },
          },
        ],
      },
    ],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Connexion impossible',
            description: 'SUPABASE_URL manque côté serveur. Préviens un propriétaire.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Trois branches serveur, pas un seul écran : « éteinte » (identité désactivée, redirige vers le mot de passe partagé — pas d’erreur), « mal_configuree » (message rouge au-dessus du formulaire) et « active » (formulaire nominal, montré ici). Trouvé en recette live le 07/09/2026 : l’écran montrait autrefois le formulaire ET une alerte rouge sur un environnement simplement éteint.',
      source: 'apps/dashboard-manager/src/app/login/page.tsx:47',
    },
    {
      kind: 'decision',
      text: 'Un second écran (« enrôlement ») remplace tout le formulaire quand le serveur répond `mfa_absent` et que la fenêtre d’enrôlement est ouverte : QR code + graine TOTP affichée UNE fois (le seul secret que cette console montre, et c’est voulu), puis un champ code. Pas modélisé comme un état du gabarit (ni vide/chargement/erreur) : c’est une bascule fonctionnelle propre à ce formulaire.',
      source: 'apps/dashboard-manager/src/app/login/_components/login-form.tsx:106',
    },
    {
      kind: 'decision',
      text: 'Le champ code n’est PAS `required` : avec l’attribut, la toute première connexion (qui mène à l’enrôlement) était bloquée côté navigateur avant d’atteindre le serveur. Un code vide n’ouvre rien : le serveur tranche.',
      source: 'apps/dashboard-manager/src/app/login/_components/login-form.tsx:186',
    },
    {
      kind: 'decision',
      text: 'Responsive : carte de connexion centrée, plafonnée à 520 px (`.wrap--etroit`) à 1280 comme à 3440 — jamais étirée horizontalement. Rien à gagner au-delà de 1920 : un formulaire n’a pas besoin de plus de largeur.',
      source: 'apps/dashboard-manager/src/app/globals.css:950',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : au-delà de 1920 rien ne change, cohérent ici, mais ce n’est nulle part une décision explicite — seulement l’absence de toute règle large-écran.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
  ],
}
