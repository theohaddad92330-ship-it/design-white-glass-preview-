import type { PageSpec } from '../../types'

/**
 * /search — le lanceur d'analyse : composer le nom, choisir le périmètre,
 * confirmer, puis suivre la progression (3-6 min). « Rien n'est collecté ni
 * débité tant que tu n'as pas confirmé. »
 *
 * Lu dans : `apps/web/src/routes/search/index.tsx` → `Search.tsx`
 * (composeur → `ScopeConfirmPanel` → `LaunchPlanNote` → `SearchLaunchPanel`)
 * → `SearchAnalyzingState` pendant le run. Textes :
 * `apps/web/src/i18n/locales/fr/search.json`.
 */
export const searchPage: PageSpec = {
  id: 'app/search',
  surface: 'app',
  domain: 'search',
  route: 'apps/web/src/routes/search/index.tsx',
  title: 'Analyser une entreprise',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      // #3618 (Louis 05/10) — le titre « Qu’est-ce que tu veux vérifier ? » et son sous-titre sont retirés.
      { type: 'component', component: 'ModeTabs', props: { items: ['Entreprise', 'Contact', 'Besoin'] } },
    ],
    progress: [
      { type: 'text', text: 'Quelle entreprise veux-tu comprendre ?', style: 'heading' },
      {
        type: 'component',
        component: 'SearchInput',
        props: { size: 'md', content: { placeholder: 'Nom de l’entreprise' } },
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['Suggestion 1', 'Suggestion 2', 'Suggestion 3'] },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Card',
        props: {
          content: {
            title: 'Confirme le périmètre avant de lancer',
            description: 'Rien n’est collecté ni débité tant que tu n’as pas confirmé.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Objet analysé', value: 'ATOS FRANCE' } },
          },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Périmètre', value: 'France' } } },
          {
            type: 'component',
            component: 'FilterChips',
            props: {
              size: 'md',
              items: ['Groupe entier', 'France', 'Filiales', 'IT & digital', 'Startups', 'Personnalisé'],
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Cadrer la collecte (facultatif)',
            description: 'Ce que tu exclus ici est réellement retiré du dossier livré.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Priorités', placeholder: 'Angles à privilégier' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Entités exclues', placeholder: 'Filiales à ignorer' } },
          },
        ],
      },
      {
        type: 'placeholder',
        kind: 'custom',
        label: 'Aperçu marché — entités et angles suggérés depuis le nom saisi',
        height: 'sm',
      },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        align: 'center',
        justify: 'between',
        children: [
          { type: 'text', text: '1 crédit sera consommé · ~3-6 min', style: 'caption', color: 'text/muted' },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'lg', content: { label: 'Confirmer et lancer' } },
          },
        ],
      },
    ],
  },
  states: {
    loading: [
      {
        type: 'placeholder',
        kind: 'custom',
        label: 'Progression de l’analyse (3-6 min) — phase courante, pourcentage, bouton Annuler',
        height: 'md',
      },
    ],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Analyse échouée' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Gabarit `wizard`, pas `list` ni un gabarit à part : /search est un PARCOURS EN ÉTAPES (composer → confirmer le périmètre → lancer → suivre la progression), sans navigation d’app pendant le run — exactement l’exemple « lancement d’analyse » du gabarit `wizard` (docs/gabarits.md). Le mode Contact/Besoin ne casse pas ce choix : il renvoie vers Contacts / Besoins plutôt que de dupliquer un second wizard.',
      source: 'apps/web/src/features/search/view/Search.tsx:1',
    },
    {
      kind: 'decision',
      text: 'Vérifier un CONTACT ou un BESOIN ne duplique jamais le lanceur : le mode renvoie vers Contacts / Besoins, chacun avec ses propres filtres et son propre historique — un seul chemin d’analyse, jamais un second formulaire qui diverge.',
      source: 'apps/web/src/i18n/locales/fr/search.json:15',
    },
    {
      kind: 'decision',
      text: 'Aucun crédit ne s’affiche chez le client (#4463, décision du 22/10/2026) : ni coût annoncé, ni solde. Avant le lancement, l’écran ne dit que ce qui change le geste — un dossier récent existant proposé à la place d’une reconsommation inutile ; un solde épuisé se dit par le frein doux, sans chiffre. Le débit continue en coulisse.',
      source: 'apps/web/src/features/search/components/LaunchPlanNote.tsx:20',
    },
    {
      kind: 'decision',
      text: 'Le champ « Priorités » et « Entités exclues » suivent la doctrine collecte : ce qui est exclu ici est RÉELLEMENT retiré du dossier livré, jamais un filtre d’affichage cosmétique.',
      source: 'apps/web/src/features/search/components/ScopeConfirmPanel.tsx:231',
    },
    {
      kind: 'decision',
      text: 'Responsive : composeur et panneau de confirmation sont mono-colonne à toutes les largeurs — un lancement d’analyse est un geste séquentiel, jamais deux blocs côte à côte qui inviteraient à sauter une étape. Le pied (bouton de lancement) reste visible en bas de viewport sur mobile. Au-delà de 1920, la colonne garde sa largeur de lecture plutôt que de s’étirer.',
      source: 'apps/web/src/features/search/view/Search.tsx:40',
    },
  ],
}
