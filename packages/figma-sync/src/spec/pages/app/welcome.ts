import type { PageSpec } from '../../types'

/**
 * /welcome — écran cible post-questionnaire (Théo restitution p.8) : le
 * profil compris, ce que BellumAI va personnaliser, l’audit commercial prêt,
 * ce que les connecteurs débloqueraient, un message de Laura et un choix de
 * point de départ (« par où tu commences »).
 *
 * Lu dans : `apps/web/src/routes/welcome.tsx` → `WelcomeScreen.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/welcome.json`.
 */
export const welcomePage: PageSpec = {
  id: 'app/welcome',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/welcome.tsx',
  title: 'Bienvenue',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [{ type: 'component', component: 'LauraFace', props: {} }],
    primary: [
      { type: 'text', text: 'Bienvenue Camille 👋', style: 'display' },
      {
        type: 'text',
        text: 'Ton profil est prêt. BellumAI a lu tes réponses et adapte chaque analyse à ton ESN.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ton profil BellumAI' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              { type: 'component', component: 'DataRow', props: { content: { label: 'Nom de l’ESN', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Taille', value: '—' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Domaines d’expertise', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Secteurs & comptes ciblés', value: '—' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', size: 'sm', content: { label: 'Corriger mon profil' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce que BellumAI va personnaliser pour toi' } },
        children: [
          {
            type: 'grid',
            columns: 4,
            columnsMobile: 2,
            gap: '3',
            children: [
              {
                type: 'component',
                component: 'Card',
                props: {
                  content: { title: 'Recherches', description: 'Des comptes ciblés selon tes secteurs et ta zone.' },
                },
              },
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Contacts', description: 'Les bons décideurs identifiés en priorité.' } },
              },
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Messages', description: 'Des accroches calées sur ton positionnement.' } },
              },
              {
                type: 'component',
                component: 'Card',
                props: {
                  content: { title: 'Scoring', description: 'Un score priorisé sur ton profil de compte idéal.' },
                },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Ton audit commercial',
            description:
              'Objectif, force, goulot et plan à 30 jours — ce que BellumAI a compris de ton activité, en détail.',
          },
        },
        children: [{ type: 'component', component: 'Button', props: { content: { label: 'Voir mon audit' } } }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce que tes connecteurs débloqueront' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Ton CRM : l’historique et les actions à jour, sans ressaisie.', value: '' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Ta messagerie : les réponses favorables remontent dans ton brief du matin.',
                    value: '',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Ton agenda : tes rendez-vous et leurs chevauchements remontent dans ton brief.',
                    value: '',
                  },
                },
              },
            ],
          },
          { type: 'component', component: 'Button', props: { content: { label: 'Connecter mes outils' } } },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: {},
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '3',
            align: 'center',
            children: [
              { type: 'component', component: 'LauraFace', props: {} },
              {
                type: 'text',
                text: 'J’ai maintenant suffisamment de contexte pour commencer. Je te propose de tester immédiatement soit un compte que tu connais, soit un consultant disponible.',
                style: 'body',
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              { type: 'component', component: 'Button', props: { content: { label: 'Laisse Laura choisir' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', content: { label: 'Analyser un compte' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', content: { label: 'Partir d’un consultant' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Par où tu commences',
            description: 'Choisis ce qui décrit ta situation. On t’emmène au bon endroit, dans le bon ordre.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Je démarre, je n’ai aucun compte en tête', value: 'Découvrir → analyse → plan' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'J’ai des comptes, je veux les creuser', value: 'Analyse → contacts → messages' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'J’ai un consultant à placer', value: 'Vivier → besoins → comptes à signaux' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Je reprends un portefeuille existant', value: 'Import → hygiène → priorisation' },
                },
              },
            ],
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Lecture impossible.', description: 'Réessaie dans un instant.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une personnalisation devenue périmée (texte généré avant un changement de logique produit) se marque explicitement « ne correspond plus à ce qu’on affiche aujourd’hui » plutôt que de continuer à s’afficher comme si elle était à jour — jamais un contenu silencieusement faux.',
      source: 'apps/web/src/i18n/locales/fr/welcome.json:35',
    },
    {
      kind: 'decision',
      text: 'Sans connecteur branché, l’écran nomme explicitement ce qui reste possible (mémoire marché, Découvrir, analyse publique…) ET ce qui devient moins précis — jamais une simple absence silencieuse de fonctionnalité.',
      source: 'apps/web/src/i18n/locales/fr/welcome.json:62',
    },
    {
      kind: 'ecart',
      text: 'Cette page est affectée au gabarit `auth` (brand/primary/footer, 3 slots) par le périmètre de ce lot, alors que son contenu réel (profil, personnalisation, audit, connecteurs, suggestions, situations) est bien plus proche d’un `dashboard` — presque tout le contenu est donc regroupé dans le seul slot `primary`, ce qui n’est pas une lecture fidèle de la richesse structurelle de l’écran.',
      source: 'apps/web/src/features/welcome/view/WelcomeScreen.tsx:78',
    },
    {
      kind: 'decision',
      text: 'Responsive : la grille de personnalisation (4 colonnes) repasse à 2 colonnes sous 768 px ; en tablette (768–1194) et bureau (1280–1920), elle tient ses 4 colonnes. Au-delà (2560, 3440), on n’étire jamais les cartes : la maquette cible une 5ᵉ carte de personnalisation ou un panneau latéral de progression plutôt que des cartes démesurément larges.',
      source: 'apps/web/src/features/welcome/view/WelcomeScreen.tsx:196',
    },
    {
      kind: 'decision',
      text: 'RUX-10 (`docs/revue-ux.md` §4, T3), ADAPTÉ à Q1 : cette page n’est plus l’arrêt post-onboarding obligatoire — Laura (`app/chat`) l’est, avec une bannière « premier jour » qui en résume l’essentiel (profil prêt, personnalisation). Le contenu détaillé (profil complet, audit, connecteurs) reste ici, atteint depuis « Voir tout mon profil » sur cette bannière, jamais un second écran d’arrivée concurrent.',
      source: 'apps/web/src/features/chat/view/Chat.tsx:2287',
    },
  ],
}
