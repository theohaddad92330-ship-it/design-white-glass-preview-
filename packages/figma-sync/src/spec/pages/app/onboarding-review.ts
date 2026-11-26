import type { PageSpec } from '../../types'

/**
 * /onboarding/$id/review — RELIRE AVANT DE GÉNÉRER L’AUDIT (#2030). Un
 * récapitulatif par bloc (organisation, BU, rôle, offre, marché, système
 * commercial, objectifs, informations à vérifier), une première sélection de
 * comptes avant même l’audit, ce que l’audit peut déjà dire et ce qu’il ne
 * peut pas encore dire, puis le lancement — gratuit, sans action externe.
 *
 * Lu dans : `apps/web/src/routes/onboarding/$id/review.tsx` →
 * `OnboardingReviewPage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/onboarding.json` (clé `review`).
 */
export const onboardingReviewPage: PageSpec = {
  id: 'app/onboarding-review',
  surface: 'app',
  domain: 'onboarding',
  route: 'apps/web/src/routes/onboarding/$id/review.tsx',
  title: 'Voici ce que tu m’as expliqué',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    progress: [
      {
        type: 'text',
        text: 'Relis les éléments importants avant de lancer la génération. Tu peux tout modifier ici.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    primary: [
      { type: 'text', text: 'Voici ce que tu m’as expliqué.', style: 'display' },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Une première sélection, avant même de lancer l’audit',
            description:
              'D’après ton secteur ciblé, ces entreprises existent déjà. L’audit complet ira plus loin sur chacune.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Entreprise', 'Secteur'],
                rows: [
                  ['Compte exemple 1', '—'],
                  ['Compte exemple 2', '—'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Organisation' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Modifier' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Rôle' } },
            children: [
              {
                type: 'text',
                text: 'Aucune information sur ton rôle collectée pour l’instant.',
                style: 'body',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Offre' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Modifier' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Marché' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Modifier' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Système commercial' } },
            children: [
              {
                type: 'text',
                text: 'Aucune information sur ton système commercial collectée pour l’instant.',
                style: 'body',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Objectifs' } },
            children: [
              { type: 'text', text: 'Aucun objectif collecté pour l’instant.', style: 'body', color: 'text/muted' },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Informations à vérifier' } },
        children: [
          {
            type: 'text',
            text: 'Aucune réponse n’est encore marquée « je ne sais pas encore ».',
            style: 'body',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          content: {
            title: 'Ces informations limiteront certaines recommandations',
            description:
              'Ce qui n’est pas encore renseigné n’est pas compté comme un problème — juste comme non mesuré. Tu peux générer l’audit maintenant et compléter plus tard.',
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Trois points méritent ton attention avant l’audit' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Tu n’as pas encore répondu : question exemple 1', value: 'Répondre' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Tu n’as pas encore répondu : question exemple 2', value: 'Répondre' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce que l’audit sait déjà dire de tes réponses' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Fronts commerciaux visés', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Routines configurées à partir de la rupture nommée', value: '—' } },
              },
            ],
          },
          { type: 'text', text: 'Ce que l’audit ne peut pas encore dire', style: 'label', color: 'text/muted' },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Le nombre de fronts tenables — le temps commercial n’est pas déclaré.',
                    value: '',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'column',
        gap: '2',
        children: [
          {
            type: 'text',
            text: 'Gratuit · aucun crédit utilisé · Génération de l’audit : environ 3 à 6 minutes · Aucune action externe n’est déclenchée',
            style: 'caption',
            color: 'text/muted',
          },
          { type: 'component', component: 'Button', props: { content: { label: 'Générer mon audit' } } },
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
      text: 'Une réponse manquante n’est jamais comptée comme un problème mais comme « non mesuré » — l’audit peut être généré immédiatement puis complété plus tard, jamais bloqué par un champ vide.',
      source: 'apps/web/src/i18n/locales/fr/onboarding.json:1814',
    },
    {
      kind: 'decision',
      text: 'L’audit NOMME une rupture dans la chaîne d’activité suivie plutôt que d’inventer une conversion au-delà de ce qui est mesuré — « L’audit le nomme, il n’invente aucune conversion. »',
      source: 'apps/web/src/i18n/locales/fr/onboarding.json:1834',
    },
    {
      kind: 'decision',
      text: 'Responsive : les six blocs de relecture (Grid 2 colonnes) repassent à 1 colonne sous 768 px ; en tablette (768–1194) et bureau (1280–1920) ils tiennent 2 colonnes. Au-delà (2560, 3440), on n’étire jamais : la maquette cible 3 colonnes de blocs plutôt que des cartes de relecture démesurément larges.',
      source: 'apps/web/src/features/onboarding/view/OnboardingReviewPage.tsx:1',
    },
  ],
}
