import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/lexicon — Lexique (D17). Lu dans
 * `apps/web/src/routes/settings/lexicon.tsx` → `LexiconPage.tsx` : renommer
 * les objets du produit (singulier/pluriel), une liste de mots interdits
 * pour Laura, et « ce que le lexique ne change pas » nommé explicitement.
 * Textes de `i18n/locales/fr/lexicon.json`.
 */
export const settingsLexiconPage: PageSpec = {
  id: 'app/settings-lexicon',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/lexicon.tsx',
  title: 'Lexique',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Lexique', style: 'title' },
      {
        type: 'text',
        text: 'Les mots que ton ESN emploie pour nommer les objets du produit. Un terme posé ici remplace le libellé partout où le produit affiche ce nom seul.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Les mots de ton équipe' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Compte', description: 'Par défaut : Compte / Comptes' } },
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Singulier', value: 'Compte' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Pluriel', value: 'Comptes' } } },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Mots à ne jamais lire',
            description: "Laura ne les emploie plus dans ce qu'elle rédige.",
          },
        },
        children: [
          { type: 'component', component: 'FilterChips', props: { size: 'md', items: ['Prospect', 'Lead'] } },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Input',
                props: { content: { placeholder: 'ex. le mot que tu ne veux plus lire' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Ajouter' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            title: 'Ce que le lexique ne change pas',
            description: 'Les phrases : « Aucun compte ne correspond » garde son mot.',
          },
        },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Enregistrer' } },
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
            title: 'Réservé aux gestionnaires de l’espace',
            description: 'Le lexique change ce que toute l’équipe lit.',
          },
        },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    RESPONSIVE_ECART_ROW,
    {
      kind: 'decision',
      text: 'Un lexique qui dit ce qu’il NE fait PAS (les phrases, non accordées) vaut mieux qu’un lexique qui ment sur la moitié : la section est un bandeau permanent, pas un texte d’aide replié.',
      source: 'apps/web/src/features/lexicon/view/LexiconPage.tsx:250',
    },
  ],
}
