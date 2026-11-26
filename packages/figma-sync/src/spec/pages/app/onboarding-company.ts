import type { PageSpec } from '../../types'

/**
 * /onboarding/company — RUX-40/Q5 : le SEUL écran obligatoire de l’onboarding,
 * ses DEUX champs — le nom de l’entreprise (préremplissage par les registres
 * publics : recherche, confirmation, ou remplissage manuel) et le rôle de
 * l’utilisateur. Gère aussi la désambiguïsation (plusieurs entreprises du
 * même nom) et l’absence de fiche publique. Son bouton lance directement la
 * première analyse (`app/onboarding-generating`) — le questionnaire complet
 * (`app/onboarding-stage`) ne bloque plus ce chemin.
 *
 * Lu dans : `apps/web/src/routes/onboarding/company.tsx` → `OnboardingCompanyPage.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/onboarding.json` (clé `prefill`).
 */
export const onboardingCompanyPage: PageSpec = {
  id: 'app/onboarding-company',
  surface: 'app',
  domain: 'onboarding',
  route: 'apps/web/src/routes/onboarding/company.tsx',
  title: 'Quelle est ton ESN ?',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    progress: [
      {
        type: 'text',
        text: '1 sur 2 — l’entreprise, puis ton rôle',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    primary: [
      { type: 'text', text: 'Quelle est ton ESN ?', style: 'display' },
      {
        type: 'text',
        text: 'Tape son nom : on récupère ses informations publiques. Tu garderas la main sur chaque réponse.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { placeholder: 'Ex : Kicklox, Sopra Steria, Devoteam…' } },
          },
          { type: 'component', component: 'Button', props: { content: { label: 'Continuer' } } },
        ],
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Remplir manuellement' } },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'C’est bien ton entreprise ?',
            description: 'Identité trouvée dans les registres publics. Si ce n’est pas la bonne, reviens à la saisie.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'info', content: { label: 'Prérempli · registre officiel' } },
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              { type: 'component', component: 'DataRow', props: { content: { label: 'SIREN', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Ville', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Pays', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Secteur (NAF)', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Effectif', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Site web', value: '—' } } },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              { type: 'component', component: 'Button', props: { content: { label: 'Oui, c’est bien nous' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', content: { label: 'Ce n’est pas ma société' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Select',
        props: {
          content: { label: 'Quel est ton rôle ?' },
          items: ['Commercial', 'Manager commercial', 'Dirigeant', 'Autre'],
        },
      },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        justify: 'between',
        children: [
          { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Quitter' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', content: { label: 'Lancer ma première analyse' } },
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
        props: {
          content: {
            title: 'Le registre n’a pas répondu.',
            description:
              'Ce n’est pas une preuve que ton entreprise n’existe pas : la recherche a échoué avant que le registre ne réponde. Réessaie, ou continue et remplis le questionnaire toi-même.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une entreprise déclarée CESSÉE ou dont le secteur NAF ne correspond pas à une ESN ne bloque jamais la suite — un avertissement s’affiche et invite juste à vérifier avant de continuer.',
      source: 'apps/web/src/i18n/locales/fr/onboarding.json:882',
    },
    {
      kind: 'decision',
      text: 'Plusieurs entreprises du même nom : la désambiguïsation force un choix explicite plutôt qu’un premier résultat pris par défaut — un mauvais choix préremplirait tout le questionnaire avec la mauvaise identité.',
      source: 'apps/web/src/i18n/locales/fr/onboarding.json:886',
    },
    {
      kind: 'decision',
      text: 'Responsive : la carte de confirmation (SIREN, ville, NAF…) empile sa liste de champs en une colonne à toutes les largeurs dans le code réel — mobile (360–767), tablette (768–1194) et bureau (1280–1920) sont identiques. Au-delà (2560, 3440), la maquette cible deux colonnes de champs côte à côte plutôt qu’une liste étirée sur toute la largeur.',
      source: 'apps/web/src/features/onboarding/view/OnboardingCompanyPage.tsx:262',
    },
    {
      kind: 'decision',
      text: 'RUX-40/Q5 : ce champ « rôle » est le second et DERNIER champ obligatoire avant la première analyse — le reste du questionnaire (organisation, offre, marché, système commercial, objectifs) devient le profil commercial facultatif de `app/onboarding-stage`, complété pendant l’attente et depuis « Aujourd’hui », jamais avant la première valeur.',
      source: 'packages/figma-sync/docs/revue-ux.md:897',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : le chargement dessinait un texte brut plutôt qu’un `Skeleton` à la forme du contenu — trois composants d’état, pas un de plus, sur les trois surfaces.',
      source: 'apps/web/src/routes/onboarding/company.tsx:1',
    },
  ],
}
