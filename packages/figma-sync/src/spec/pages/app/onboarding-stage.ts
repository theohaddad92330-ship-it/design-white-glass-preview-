import type { PageSpec } from '../../types'

/**
 * /onboarding/$id/$stage/$slug — la sous-étape de question elle-même : le cœur
 * du questionnaire Temps-1 (24 sous-étapes réparties en six étapes —
 * organisation, rôle, offre, marché, système commercial, objectifs). Barre
 * d’actions collante (Quitter / Retour / Continuer), navigateur d’étapes à
 * gauche, tiroir « Voir mes réponses » accessible depuis n’importe quelle
 * sous-étape.
 *
 * RUX-40/Q5 : ce questionnaire n’est plus une étape obligatoire AVANT la
 * première analyse (`app/onboarding-company` la lance directement avec ses
 * deux champs) — c’est le « profil commercial » facultatif, complété pendant
 * l’attente de l’analyse (`app/onboarding-generating`) puis depuis
 * « Aujourd’hui ». Sa progression se compte en QUESTIONS, jamais en
 * pourcentage (un pourcentage se lirait comme une chance).
 *
 * Lu dans : `apps/web/src/routes/onboarding/$id/$stage/$slug.tsx` →
 * `OnboardingStagePage.tsx` → `OnboardingWizard.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/onboarding.json` (clés `stepper`, `questions`).
 */
export const onboardingStagePage: PageSpec = {
  id: 'app/onboarding-stage',
  surface: 'app',
  domain: 'onboarding',
  route: 'apps/web/src/routes/onboarding/$id/$stage/$slug.tsx',
  title: 'Ton organisation',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      // RUX-41 (docs/revue-ux.md §2 P4) : « Terminer plus tard » est un lien tertiaire dans
      // l'entête, pas un bouton du pied — il ENREGISTRE l'état, jamais un abandon qui ramène
      // au premier écran (l'ancien « Quitter » du pied disparaît).
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Terminer plus tard' } },
      },
    ],
    progress: [
      {
        type: 'text',
        text: 'Profil commercial (facultatif) · Étape 3/7 · 11 questions sur 24 restantes',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionSidebarNav',
        props: {
          content: { title: 'Étapes du questionnaire' },
          items: [
            'Ton organisation',
            'Ton rôle',
            'Ton offre',
            'Ton marché',
            'Ton système commercial',
            'Tes objectifs',
            'Ton audit',
          ],
        },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          content: { title: 'Voici ce que ton équipe a déjà configuré.' },
        },
      },
      {
        type: 'text',
        text: 'Cette partie permet à BellumAI de mieux connaître ton ESN.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        justify: 'between',
        children: [
          { type: 'text', text: 'Ton organisation', style: 'label', color: 'text/accent' },
          { type: 'text', text: 'Enregistré à —', style: 'caption', color: 'text/muted' },
        ],
      },
      {
        type: 'component',
        component: 'Select',
        props: {
          content: { label: 'Quelle est la taille de ton ESN ?' },
          items: ['Moins de 10', '10 à 50', '50 à 200', 'Plus de 200'],
        },
      },
      { type: 'component', component: 'HelpIcon', props: { content: { label: 'Pourquoi cette question ?' } } },
      { type: 'component', component: 'Badge', props: { variant: 'info', content: { label: 'Prérempli · registre' } } },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        justify: 'between',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Voir mes réponses' } },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Retour' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Continuer' } },
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
      text: 'UNE seule barre d’actions, toujours rendue, les deux boutons dedans : avant, « Continuer » était absent tant que la réponse manquait, et un second bouton désactivé vivait en bas de la colonne — répondre faisait disparaître une cible du bas pour en faire apparaître une en haut (#2021.5).',
      source: 'apps/web/src/features/onboarding/view/OnboardingWizard.tsx:292',
    },
    {
      kind: 'decision',
      text: 'L’abandon tracé n’est que celui qui se CLIQUE (« Terminer plus tard »), et il n’émet que le SLUG de la sous-étape — jamais une réponse, jamais ce que la personne avait commencé à écrire, jamais qui elle est.',
      source: 'apps/web/src/features/onboarding/view/OnboardingWizard.tsx:322',
    },
    {
      kind: 'ecart',
      text: 'RUX-41 (docs/revue-ux.md §2 P4) : le code garde encore « Quitter » comme bouton du pied, à côté de « Retour »/« Continuer » — la maquette cible un lien tertiaire « Terminer plus tard » dans l’entête, qui ENREGISTRE l’état et ne ramène jamais dans le parcours au retour.',
      source: 'apps/web/src/features/onboarding/view/OnboardingWizard.tsx:292',
    },
    {
      kind: 'decision',
      text: 'RUX-41 (docs/revue-ux.md §2 P4, addenda au Top 20) : le gabarit `wizard` impose une anatomie fixe — progression visible en haut (étape n sur N, nom des étapes à ≥ 1024), « Retour » à gauche et « Continuer » à droite dans le pied collant, « Terminer plus tard » en lien tertiaire dans l’entête. Jamais un « Quitter » qui se confond visuellement avec « Retour », jamais un abandon qui ne sauvegarde rien.',
      source: 'apps/web/src/features/onboarding/view/OnboardingWizard.tsx:292',
    },
    {
      kind: 'ecart',
      text: 'La colonne de questions était BORNÉE tardivement (#2021.1) : sous `md`, la grille passait à une colonne qui occupait toute la largeur de `max-w-6xl` (~1 100 px, ~138 caractères par ligne) — le double de la largeur de lecture D81. Corrigé par `max-w-xl` sur la colonne centrale ; à surveiller si un futur type de question (tableau, liste longue) revient sur cette borne.',
      source: 'apps/web/src/features/onboarding/view/OnboardingWizard.tsx:278',
    },
    {
      kind: 'decision',
      text: 'Responsive : le navigateur d’étapes (`aside`) devient une colonne collante seulement à partir de `md` (768 px, GA-28) — sous 768 px il se déroule EN LIGNE au-dessus des questions plutôt qu’en colonne fixe, la même borne 768 px pour tout le dépôt (#2021.7, #2021.19). En tablette (768–1194) et bureau (1280–1920), la grille est `220px_1fr_300px`. Au-delà (2560, 3440), on n’étire jamais la colonne centrale (bornée `max-w-xl`) ni le panneau d’aide : la maquette cible plus d’espace de respiration de part et d’autre, jamais un texte de question à pleine largeur.',
      source: 'apps/web/src/features/onboarding/view/OnboardingWizard.tsx:267',
    },
    {
      kind: 'decision',
      text: 'RUX-40/Q5 : ce questionnaire n’est plus dans le chemin obligatoire avant la première analyse — désormais un profil commercial facultatif, atteint pendant l’attente de l’analyse et depuis « Aujourd’hui ». Sa progression se compte en questions restantes, jamais en pourcentage : un pourcentage à côté d’un audit commercial se lirait comme une chance, ce que la doctrine interdit.',
      source: 'packages/figma-sync/docs/revue-ux.md:897',
    },
  ],
}
