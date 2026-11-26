import type { PageSpec } from '../../types'

/**
 * / (accueil) — deux comportements selon la session, jamais un troisième :
 * · non connecté → l'invitation à se connecter (ci-dessous) ;
 * · connecté → une redirection SILENCIEUSE vers la page d'atterrissage par
 *   défaut (Laura sur mobile quelle que soit la préférence, sinon l'écran
 *   choisi dans Réglages › Démarrage, dont le défaut est Laura et non le
 *   tableau de bord).
 *
 * Cette maquette porte le premier cas — le seul qui affiche un écran. Le
 * second n'a pas de frame propre : c'est une redirection pure, documentée en
 * `uxNotes` plutôt qu'inventée en écran.
 *
 * Lu dans : `apps/web/src/routes/index.tsx` → `home-page.tsx` →
 * `invite-to-login-page.tsx`. Textes : `apps/web/src/i18n/locales/fr/auth.json`.
 */
export const homePage: PageSpec = {
  id: 'app/home',
  surface: 'app',
  domain: 'home',
  route: 'apps/web/src/routes/index.tsx',
  title: 'Accueil',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [{ type: 'component', component: 'BrandMark', props: { size: 'xl' } }],
    primary: [
      { type: 'component', component: 'LauraFace', props: {} },
      { type: 'text', text: 'BellumAI', style: 'display' },
      { type: 'text', text: 'Ton copilote d’intelligence commerciale.', style: 'heading' },
      {
        type: 'text',
        text: 'Connecte-toi pour transformer un nom d’entreprise en dossier de conquête complet.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Contacts décisionnels, organigramme, plan d’action et messages prêts à envoyer en 5 minutes.',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Se connecter' } } },
      { type: 'component', component: 'Button', props: { variant: 'outline', content: { label: 'Créer un compte' } } },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de vérifier ta session.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Gabarit `auth`, pas `marketing` : cette maquette ne porte QUE le cas non connecté (`invite-to-login-page.tsx`) — aucune barre de navigation du site, une colonne centrée de 400 px (marque, message, deux boutons), exactement les zones `brand` → `primary` du gabarit `auth`. Le cas connecté n’a pas de frame propre (redirection silencieuse, voir la note suivante), donc rien à ranger ailleurs.',
      source: 'apps/web/src/components/templates/invite-to-login/invite-to-login-page.tsx:1',
    },
    {
      kind: 'decision',
      text: 'Un opérateur backoffice RESTE un utilisateur : le rôle `backoffice` n’ouvre plus un accueil séparé (qui affichait « À implémenter. » sans sortie), il ajoute seulement une entrée à la barre latérale. `customer` et `backoffice` mènent au même accueil.',
      source: 'apps/web/src/components/templates/home-page.tsx:24',
    },
    {
      kind: 'decision',
      text: 'Un utilisateur connecté ne voit JAMAIS cet écran : il est redirigé silencieusement vers Laura (mobile, quelle que soit la préférence) ou vers l’écran choisi dans Réglages › Démarrage — dont le défaut est désormais Laura, pas le tableau de bord.',
      source: 'apps/web/src/components/templates/home-page.tsx:30',
    },
    {
      kind: 'decision',
      text: 'La redirection utilise `beforeLoad`/`<RedirectTo>`, jamais `<Navigate>` (GA-27) : `<Navigate>` compare l’identité de son objet props et rejoue en boucle — 106 erreurs React #185 mesurées sur la seule transition `/` → `/dashboard`.',
      source: 'apps/web/src/components/templates/home-page.tsx:30',
    },
    {
      kind: 'decision',
      text: 'Responsive : écran mono-colonne centré à toutes les largeurs (360 → 3440) — une invitation à se connecter n’a ni tableau ni grille à faire évoluer. Les deux boutons restent empilés sur mobile et passent côte à côte à partir de 768 px si la largeur du texte le permet ; au-delà de 1920, le bloc garde sa largeur de lecture centrée.',
      source: 'apps/web/src/components/templates/invite-to-login/invite-to-login-page.tsx:1',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : `BrailleLoader` est réservé à l’attente longue d’une analyse et nulle part ailleurs — la vérification de session est instantanée, l’écran dessine désormais `Skeleton`.',
      source: 'apps/web/src/components/templates/home-page.tsx:1',
    },
  ],
}
