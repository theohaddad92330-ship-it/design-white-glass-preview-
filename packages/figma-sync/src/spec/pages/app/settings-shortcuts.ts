import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/shortcuts — Raccourcis clavier (demande de Louis 30/08/2026). Lu
 * dans `apps/web/src/routes/settings/shortcuts.tsx` → `ShortcutsSettingsView`
 * : un tableau par portée (Aller à / Partout / Dans un dossier de compte),
 * puis un groupe qui EXPLIQUE pourquoi rien ne se redéfinit encore. Textes de
 * `i18n/locales/fr/shortcuts.json`.
 */
export const settingsShortcutsPage: PageSpec = {
  id: 'app/settings-shortcuts',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/shortcuts.tsx',
  title: 'Raccourcis clavier',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Raccourcis clavier', style: 'title' },
      {
        type: 'text',
        text: 'Ce qu’ils font, où ils répondent, et comment ils s’écrivent sur ton clavier.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Ces raccourcis demandent un clavier physique. Sur un écran tactile, tout ce qu’ils font reste accessible au doigt, par la navigation.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Aller à', description: 'Une séquence à deux temps : G, puis la lettre.' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Touches', 'Ce qu’il fait', 'Portée'],
                rows: [
                  ['G C', 'Comptes', 'Aller à'],
                  ['G P', 'Opportunités', 'Aller à'],
                  ['G T', 'Talents', 'Aller à'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Partout', description: 'Une combinaison, sur n’importe quel écran.' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Touches', 'Ce qu’il fait', 'Portée'],
                rows: [['Ctrl K', 'Recherche universelle', 'Partout']],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: { title: 'Dans un dossier de compte', description: 'Une touche seule, sur le dossier d’un compte.' },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Touches', 'Ce qu’il fait', 'Portée'],
                rows: [['/', 'Rechercher dans le dossier', 'Dans un dossier de compte']],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: { title: 'Les redéfinir', description: 'Pas encore possible — voici exactement ce qui manque.' },
        },
        children: [
          {
            type: 'text',
            text: 'Le repli de la barre latérale est écouté par un composant partagé, qui ne peut pas lire tes réglages.',
            style: 'body',
            color: 'text/secondary',
          },
          {
            type: 'text',
            text: 'Redéfinir une combinaison suppose de savoir lesquelles sont déjà prises par ton navigateur et ton système.',
            style: 'body',
            color: 'text/secondary',
          },
          {
            type: 'text',
            text: 'Tes réglages d’interface sont aujourd’hui gardés dans ce navigateur, donc sur ce poste.',
            style: 'body',
            color: 'text/secondary',
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger les raccourcis.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'Au doigt, cette page n’a pas de sujet — l’entrée qui y mène est masquée en pointeur grossier (`pointerFineOnly`), mais la page reste atteignable par son adresse et le dit au lieu d’afficher une grille de touches inutilisable.',
      source: 'apps/web/src/features/shortcuts/view/ShortcutsSettingsView.tsx:69',
    },
    {
      kind: 'decision',
      text: 'Trois obstacles à la redéfinition sont NOMMÉS plutôt que comptés (« trois raisons ») : le jour où l’un tombe, on retire la ligne au lieu de laisser un compte devenir mensonger.',
      source: 'apps/web/src/features/shortcuts/view/ShortcutsSettingsView.tsx:104',
    },
  ],
}
