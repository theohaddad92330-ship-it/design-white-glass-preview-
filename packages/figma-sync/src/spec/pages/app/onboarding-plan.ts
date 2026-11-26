import type { PageSpec } from '../../types'

/**
 * /onboarding/plan — par quoi commencer, AVANT le questionnaire (compte neuf
 * uniquement — un compte déjà servi est redirigé). Trois entrées : démonstration
 * sans compte, offre payante, devis Entreprise.
 *
 * Lu dans : `apps/web/src/routes/onboarding/plan.tsx` → `OnboardingPlanPage.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/onboarding.json` (clé `plan`).
 */
export const onboardingPlanPage: PageSpec = {
  id: 'app/onboarding-plan',
  surface: 'app',
  domain: 'onboarding',
  route: 'apps/web/src/routes/onboarding/plan.tsx',
  title: 'Choisis ton offre',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    progress: [{ type: 'text', text: 'Avant de commencer le questionnaire', style: 'caption', color: 'text/muted' }],
    primary: [
      { type: 'text', text: 'Choisis ton offre', style: 'display' },
      {
        type: 'text',
        text: 'Trois entrées : voir le produit en démonstration, prendre l’offre, ou demander un devis pour ton équipe. Tu changes d’offre à tout moment depuis la facturation.',
        style: 'body',
        color: 'text/secondary',
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
            props: { content: { title: 'Découverte' } },
            children: [
              { type: 'text', text: '— € /mois', style: 'display' },
              { type: 'text', text: '— crédits par mois', style: 'caption', color: 'text/muted' },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: '— crédits par mois — de quoi ouvrir — dossiers complets.', value: '' },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: '1 utilisateur inclus.', value: '' } },
                  },
                ],
              },
              { type: 'component', component: 'Button', props: { content: { label: 'Continuer vers le paiement' } } },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Croissance' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'primary', content: { label: 'Recommandé' } },
              },
              { type: 'text', text: '— € /mois', style: 'display' },
              { type: 'component', component: 'Button', props: { content: { label: 'Continuer vers le paiement' } } },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Entreprise' } },
            children: [
              {
                type: 'text',
                text: '2 utilisateurs inclus. À partir de deux personnes, c’est l’offre Entreprise, sur devis.',
                style: 'body',
                color: 'text/muted',
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', content: { label: 'Demander un devis' } },
              },
            ],
          },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'text',
            text: 'Sans compte, dans un nouvel onglet — ton inscription reste ouverte ici.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', content: { label: 'Ouvrir la démonstration' } },
          },
        ],
      },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'column',
        gap: '1',
        children: [
          {
            type: 'text',
            text: 'Paiement sécurisé · engagement initial de 30 jours, puis mensuel',
            style: 'caption',
            color: 'text/muted',
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
        props: { content: { title: 'Le paiement n’a pas pu démarrer.', description: 'Réessaie dans un instant.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Cet écran s’adresse à un compte NEUF uniquement : un compte déjà installé (palier ≠ `decouverte`, ou analyses déjà consommées) est redirigé avant d’y arriver — on ne lui redemande jamais de choisir une offre qu’il paie déjà.',
      source: 'apps/web/src/routes/onboarding/plan.tsx:10',
    },
    {
      kind: 'decision',
      text: 'Une lecture de crédits qui ÉCHOUE n’affiche jamais cet écran « au cas où » : elle renvoie au tableau de bord plutôt que de risquer de demander à un abonné de re-choisir une offre.',
      source: 'apps/web/src/routes/onboarding/plan.tsx:19',
    },
    {
      kind: 'decision',
      text: 'Responsive : les trois cartes d’offre (Grid 3 colonnes) repassent à 1 colonne sous 768 px, restent à 1 en tablette étroite (768–900, pas de palier à 2 dans le code actuel) puis 3 dès le bureau. Au-delà de 1920 (2560, 3440), on n’étire jamais les cartes : la maquette cible plus d’espace de respiration entre elles, jamais une carte à trois fois sa largeur.',
      source: 'apps/web/src/features/onboarding/view/OnboardingPlanPage.tsx:1',
    },
  ],
}
