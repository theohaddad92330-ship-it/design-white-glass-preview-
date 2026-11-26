import type { PageSpec } from '../../types'

/**
 * /onboarding/$id/generating — écran de génération dédié (#2089.28) : les six
 * phases de calcul de l’audit, leur statut, et un message qui autorise
 * explicitement à quitter la page sans perdre le travail. RUX-40/Q5 : c’est
 * ici, pendant les 3 à 6 minutes d’attente, que le profil commercial
 * facultatif (`app/onboarding-stage`) se propose pour la première fois.
 *
 * Lu dans : `apps/web/src/routes/onboarding/$id/generating.tsx` →
 * `OnboardingGeneratingPage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/onboarding.json` (clé `generating`).
 */
export const onboardingGeneratingPage: PageSpec = {
  id: 'app/onboarding-generating',
  surface: 'app',
  domain: 'onboarding',
  route: 'apps/web/src/routes/onboarding/$id/generating.tsx',
  title: 'On prépare ton audit',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    progress: [
      {
        type: 'text',
        text: 'Quelques minutes suffisent — tu peux rester ou revenir plus tard.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    primary: [
      { type: 'text', text: 'On prépare ton audit', style: 'display' },
      {
        type: 'text',
        text: 'Tu peux quitter cette page, le travail continuera.',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'text', text: 'Aucune action externe n’est déclenchée', style: 'caption', color: 'text/muted' },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce que je regarde' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Vérification de tes réponses', value: 'Terminé' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Constitution de ton profil commercial', value: 'En cours' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Analyse de ton marché', value: 'En attente' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Analyse de ton offre', value: 'En attente' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Premières recommandations', value: 'En attente' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Sauvegarde de ton audit', value: 'En attente' } },
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
            title: 'Complète ton profil pendant l’attente',
            description:
              '24 questions facultatives affinent tes prochaines analyses — rattrapées ensuite si tu les sautes.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: '24 questions restantes — répondre' } },
          },
        ],
      },
    ],
    footer: [
      { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Revenir plus tard' } } },
    ],
  },
  states: {
    loading: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce que je regarde' } },
        children: [{ type: 'component', component: 'Skeleton', props: { shape: 'line' } }],
      },
    ],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Analyse de ton marché a échoué',
            description: 'Tes réponses sont conservées, rien n’est perdu.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'La génération est explicitement quittable — « Tu peux quitter cette page, le travail continuera » — pour ne jamais faire de cet écran une salle d’attente obligatoire pendant 3 à 6 minutes.',
      source: 'apps/web/src/i18n/locales/fr/onboarding.json:1862',
    },
    {
      kind: 'decision',
      text: 'Une phase en échec propose de la RELANCER seule, sans perdre les réponses ni redémarrer les cinq autres phases déjà terminées.',
      source: 'apps/web/src/i18n/locales/fr/onboarding.json:1886',
    },
    {
      kind: 'decision',
      text: 'Responsive : la liste des six phases est une colonne unique à toutes les largeurs (DataList empilée) — mobile, tablette et bureau sont identiques. Au-delà de 1920 (2560, 3440), on n’étire jamais la liste : la maquette cible deux colonnes de phases (3+3) plutôt qu’une liste verticale démesurément espacée.',
      source: 'apps/web/src/features/onboarding/view/OnboardingGeneratingPage.tsx:1',
    },
    {
      kind: 'decision',
      text: 'RUX-40/Q5 : le profil commercial facultatif se propose ici pour la première fois, avec un compte de QUESTIONS restantes (24) — jamais un pourcentage, qui se lirait comme une chance sur cet écran d’attente d’un audit commercial. La même carte réapparaît depuis « Aujourd’hui » ensuite.',
      source: 'packages/figma-sync/docs/revue-ux.md:897',
    },
  ],
}
