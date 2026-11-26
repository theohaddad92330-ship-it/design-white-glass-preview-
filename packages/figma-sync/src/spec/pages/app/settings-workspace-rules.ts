import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/workspace-rules — Règles d'espace (#2081.14, décision Louis
 * 19/09/2026). Lu dans `apps/web/src/routes/settings/workspace-rules.tsx` →
 * `WorkspaceRulesView.tsx` : deux groupes à choix unique (visibilité des
 * comptes d'unité, qui peut exporter), chacun avec la trace de son dernier
 * changement. Textes de `i18n/locales/fr/workspaceRules.json`.
 */
export const settingsWorkspaceRulesPage: PageSpec = {
  id: 'app/settings-workspace-rules',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/workspace-rules.tsx',
  title: 'Règles d’espace',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Règles d’espace', style: 'title' },
      {
        type: 'text',
        text: 'Posées par un administrateur pour tout l’espace, elles priment sur les réglages de chacun.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            title: 'Lecture seule',
            description: 'Seul un administrateur de l’espace peut changer ces règles.',
          },
        },
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Comptes d’une unité',
            description: 'Qui voit les comptes rattachés à une agence, une BU ou une équipe.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'RadioGroup',
            props: {
              state: 'disabled',
              items: ['Partagés à tout l’espace', 'Privés à l’unité'],
            },
          },
          { type: 'text', text: 'Valeur par défaut, jamais changée.', style: 'caption', color: 'text/muted' },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Qui peut exporter',
            description: 'Tout ce qui fait sortir les données de l’espace, depuis l’écran comme depuis Laura.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'RadioGroup',
            props: {
              state: 'disabled',
              items: ['Tous ceux qui en ont le droit', 'Administrateurs seulement'],
            },
          },
          { type: 'text', text: 'Valeur par défaut, jamais changée.', style: 'caption', color: 'text/muted' },
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
        props: { content: { title: 'Je n’ai pas pu lire les règles d’espace.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'ecart',
      text: '`RadioGroup` ne porte qu’un `legend`/`hint` GLOBAUX (pas un hint par option) et aucun état coché par item : le choix RETENU (`rule.value`) ne se distingue donc pas visuellement des autres options dans la maquette, contrairement au code (bordure et fond du bouton sélectionné). Le hint de chaque option, perdu dans la maquette : « Partagés » = le niveau d’accès de chacun décide comme avant, « Privés » = seuls les membres de l’unité voient ses comptes (même réglés sur « tout l’espace »), « Tous ceux qui en ont le droit » = chaque membre dont le rôle ou un accord individuel permet l’export, « Administrateurs seulement » = le propriétaire et les administrateurs, un accord individuel ne suffit plus.',
      source: 'apps/web/src/i18n/locales/fr/workspaceRules.json:12',
    },
  ],
}
