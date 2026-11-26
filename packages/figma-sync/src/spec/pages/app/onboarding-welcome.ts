import type { PageSpec } from '../../types'

/**
 * /onboarding — Page 0, « valeur d’abord » (RUX-40/Q5, arbitrage Louis
 * 25/09/2026) : la promesse, PUIS deux questions (`app/onboarding-company` :
 * l’entreprise et le rôle), PUIS la première analyse — plus les 24 sous-étapes
 * du questionnaire avant la première valeur. Le questionnaire complet devient
 * un « profil commercial » facultatif, complété pendant l’attente de l’analyse
 * (`app/onboarding-generating`) et depuis « Aujourd’hui » ensuite
 * (`app/onboarding-stage`). Quatre variantes de titre/description selon
 * le contexte (repriser, rafraîchir, invité, bêta, retour payant).
 *
 * Lu dans : `apps/web/src/routes/onboarding/index.tsx` (le garde calcule la
 * destination réelle et ne rend cette page que si `resolveOnboardingEntry`
 * vaut autre chose que `continue`) → `OnboardingWelcomePage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/onboarding.json` (clé `welcome`).
 */
export const onboardingWelcomePage: PageSpec = {
  id: 'app/onboarding',
  surface: 'app',
  domain: 'onboarding',
  route: 'apps/web/src/routes/onboarding/index.tsx',
  title: 'Configurons BellumAI pour ton activité',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    progress: [{ type: 'text', text: '2 questions, puis ta première analyse', style: 'caption', color: 'text/muted' }],
    primary: [
      { type: 'text', text: 'Configurons BellumAI pour ton activité.', style: 'display' },
      {
        type: 'text',
        text: 'Deux questions, puis Laura lance ta première analyse. Le reste de ton profil se complète pendant l’attente, et plus tard si tu préfères.',
        style: 'body',
        color: 'text/secondary',
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
                text: 'Je vais te guider pour préparer ton premier audit — tu gardes la main à chaque étape.',
                style: 'body',
              },
            ],
          },
        ],
      },
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: {
              content: {
                title: 'Comprendre ton activité',
                description:
                  'Tes expertises, tes cibles et ta façon de vendre cadrent tout ce que Laura cherche ensuite.',
              },
            },
          },
          {
            type: 'component',
            component: 'Card',
            props: {
              content: {
                title: 'Identifier ce qui peut t’aider',
                description: 'Les comptes où ton offre a une place, avec les faits qui le disent.',
              },
            },
          },
          {
            type: 'component',
            component: 'Card',
            props: {
              content: {
                title: 'Préparer ton premier mouvement',
                description: 'Interlocuteurs, angle d’approche et message prêt à relire. Tu gardes la main.',
              },
            },
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
            props: { content: { label: 'Tes réponses restent modifiables à tout moment.', value: '' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Ce qui est public est prérempli quand on le trouve — tu corriges, tu valides.',
                value: '',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Aucune action n’est envoyée sans ta validation.', value: '' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Tu peux t’arrêter et reprendre plus tard, là où tu en étais.', value: '' } },
          },
        ],
      },
      {
        type: 'text',
        text: 'À l’arrivée : ton audit et tes premiers comptes à travailler.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'column',
        gap: '2',
        children: [
          { type: 'component', component: 'Button', props: { content: { label: 'Commencer mon audit' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', content: { label: 'Reprendre plus tard' } },
          },
          {
            type: 'text',
            text: 'Tu préfères voir le produit avant de répondre ? Ça remplace ta session en cours — il faudra te reconnecter pour revenir ici.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Découvrir le produit en démo' } },
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
      text: 'La page 0 ne s’affiche QUE pour un questionnaire encore vierge ou un espace à qui l’on demande de reconfigurer — tout le reste (onboarding repris, profil partiellement répondu) saute directement à la première sous-étape en attente, à l’octet près du chemin d’avant (#2013/#2022).',
      source: 'apps/web/src/routes/onboarding/index.tsx:53',
    },
    {
      kind: 'decision',
      text: 'Un associé qui rejoint une ESN déjà renseignée (`inherited_answer_keys` non vide) est reposé directement sur sa première sous-étape PERSONNELLE, jamais sur les onze questions déjà répondues par son entreprise (#1671-ter).',
      source: 'apps/web/src/routes/onboarding/index.tsx:67',
    },
    {
      kind: 'decision',
      text: 'Responsive : les trois cartes de bénéfices (Grid 3 colonnes) repassent à 1 colonne sous 768 px et restent à 1 colonne en tablette (768–1194, pas de palier intermédiaire dans cette maquette) ; en bureau (1280–1920) et très grand écran (2560, 3440), on n’étire jamais la largeur de lecture du texte — la maquette cible une quatrième carte de réassurance à droite plutôt qu’élargir les trois existantes.',
      source: 'apps/web/src/features/onboarding/view/OnboardingWelcomePage.tsx:212',
    },
    {
      kind: 'decision',
      text: 'RUX-40/Q5 (arbitrage Louis 25/09/2026, `docs/revue-ux.md` §6) : « valeur d’abord » — 49 sous-étapes avant la première valeur devenaient 24 dans le code réel, les deux trop nombreuses face à la promesse « un dossier en 5 minutes ». La promesse tient désormais : deux champs (`app/onboarding-company`), puis la première analyse ; le questionnaire complet devient un profil commercial facultatif. Risque accepté : une première analyse moins personnalisée, rattrapée au rejeu ciblé une fois le profil complété.',
      source: 'packages/figma-sync/docs/revue-ux.md:897',
    },
  ],
}
