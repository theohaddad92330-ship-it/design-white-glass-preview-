import type { PageSpec } from '../../types'

/**
 * /demo/acces — le formulaire OBLIGATOIRE entre « Lancer la démo » et la démo
 * (#2705.1). `DemoEntryPage` (`/demo`) y envoie tout visiteur dont le cookie
 * ne porte aucun lead connu, en reportant sa query (`?t=` d'un environnement
 * verrouillé, UTM). Contenu et disposition inchangés par rapport à `/demo` :
 * même panneau de marque, même largeur de carte — une étape de plus dans le
 * MÊME parcours, pas un nouvel écran à réapprendre. Gabarit `auth`, comme
 * `/demo` et `/login` (même `AuthBrandingPanel`).
 *
 * Lu dans : `apps/web/src/routes/demo_/acces.tsx` → `DemoAccessPage.tsx`
 * (`AuthBrandingPanel` + formulaire piloté par `useDemoAccessForm`). Textes :
 * `apps/web/src/i18n/locales/fr/common.json` (`demo.entry.form.*`).
 */
export const demoAccesPage: PageSpec = {
  id: 'app/demo-acces',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/demo_/acces.tsx',
  title: 'Avant de lancer la démo',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [
      { type: 'component', component: 'BrandMark', props: { size: 'lg' } },
      { type: 'text', text: 'Priorise les bons comptes, puis passe à l’action.', style: 'display' },
    ],
    primary: [
      { type: 'text', text: 'Avant de lancer la démo', style: 'title' },
      {
        type: 'text',
        text: 'Quelques informations pour mieux comprendre ton contexte et t’accompagner après ta découverte de BellumAI.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '3',
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'Prénom', placeholder: 'Marie' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Nom', placeholder: 'Dupont' } } },
        ],
      },
      {
        type: 'component',
        component: 'Input',
        props: { content: { label: 'Adresse e-mail professionnelle', placeholder: 'prenom@entreprise.com' } },
      },
      {
        type: 'component',
        component: 'Select',
        props: {
          size: 'md',
          content: { label: 'Fonction', placeholder: 'Sélectionne ta fonction' },
          items: [
            'Business Developer / Business Manager',
            'Manager / Responsable d’équipe',
            'Directeur d’agence / BU',
            'Directeur commercial / Head of Sales',
            'Fondateur / Dirigeant d’ESN',
            'Freelance / Indépendant',
            'Autre',
          ],
        },
      },
      {
        type: 'component',
        component: 'Input',
        props: { content: { label: 'Nom de l’entreprise', placeholder: 'Acme' } },
      },
      {
        type: 'component',
        component: 'Input',
        props: { content: { label: 'Numéro de téléphone', placeholder: '' } },
      },
      {
        type: 'text',
        text: 'Ces informations nous permettront de te recontacter, de répondre à tes questions et de te proposer l’offre la plus adaptée à ta structure. Aucun engagement.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'text',
        text: 'En continuant, tu acceptes que BellumAI utilise ces informations pour te recontacter au sujet du produit. Consulte notre politique de confidentialité.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', content: { label: 'Accéder à la démo' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Aller à la connexion' } },
      },
    ],
  },
  states: {
    loading: [
      { type: 'component', component: 'Button', props: { state: 'loading', content: { label: 'Accéder à la démo' } } },
    ],
    error: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: { variant: 'danger', content: { title: 'Une erreur est survenue. Réessaie dans un instant.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le message de remerciement REMPLACE le formulaire, il ne s’affiche jamais derrière un bouton encore visible : « Merci {prénom}. Bonne découverte de BellumAI » clôt le parcours, jamais un entre-deux silencieux.',
      source: 'apps/web/src/features/demo/view/DemoAccessPage.tsx:33',
    },
    {
      kind: 'decision',
      text: 'Seule la fonction (`jobTitle`) et l’email professionnel sont contraints par une liste/un format strict ; le téléphone reste facultatif. Le champ « Nom de l’entreprise » n’est PAS résolu au registre ici : c’est un texte libre de qualification commerciale, pas un compte BellumAI.',
      source: 'apps/web/src/features/demo/hooks/useDemoAccessForm.ts:1',
    },
    {
      kind: 'decision',
      text: 'Le `_` de `demo_` sort intentionnellement la route du gabarit de `/demo` (qui n’a pas d’`<Outlet />`) : imbriquée, elle ne se serait jamais affichée — même panneau de marque et même largeur de carte que `/demo`, une étape de plus dans le même parcours.',
      source: 'apps/web/src/routes/demo_/acces.tsx:9',
    },
    {
      kind: 'decision',
      text: 'Responsive : comme `/demo` et `/login`, le panneau de marque est masqué sous 1024 px (`lg:grid-cols-2`), pas 768 px — en dessous, seule la carte de formulaire s’affiche, pleine largeur avec gouttière. Au-delà de 1920 (2560, 3440), on n’étire jamais la carte (`max-w-md`) : la page GAGNE de l’espace de respiration autour du panneau de marque et du formulaire, jamais un champ à pleine largeur démesurée.',
      source: 'apps/web/src/features/demo/view/DemoAccessPage.tsx:31',
    },
  ],
}
