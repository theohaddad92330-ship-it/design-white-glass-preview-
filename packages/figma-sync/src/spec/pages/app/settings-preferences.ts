import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_GROUPS_DECISION,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings — Préférences (page d'accueil des Réglages). Lu dans
 * `apps/web/src/routes/settings/index.tsx` → `PreferencesView.tsx` : quatre
 * groupes (Démarrage, Saisie, Apparence, À propos), textes de
 * `i18n/locales/fr/settings.json` (`preferences.*`).
 */
export const settingsPreferencesPage: PageSpec = {
  id: 'app/settings-preferences',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/index.tsx',
  title: 'Préférences',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Préférences', style: 'title' },
      {
        type: 'text',
        text: "Apparence, raccourcis et autres préférences générales de l'interface.",
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Démarrage' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Vue par défaut',
                description: 'La vue affichée au lancement de BellumAI.',
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Affichage des noms',
                description: 'Comment les noms des contacts sont affichés dans les listes.',
              },
            },
          },
          {
            // RUX-39 (docs/revue-ux.md §2 P3) : UN bouton, pas trois portes qui reformulent
            // « relancer/revoir » chacune à sa façon — le menu porte le choix.
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Revoir la prise en main',
                description: 'Checklist de démarrage, visite guidée ou scénario commercial de démonstration.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'DropdownMenu',
                props: {
                  content: { trigger: 'Revoir la prise en main' },
                  items: ['Checklist de démarrage', 'Visite guidée', 'Scénario commercial'],
                },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: "Centre d'aide", description: 'Ouvre le centre d’aide.' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Saisie' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: { label: 'Envoi des commentaires', description: 'La touche qui envoie un message à Laura.' },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Apparence' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Thème', description: "Utiliser le thème de l'app." } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Taille du texte',
                description: "Ajuster la taille du texte dans toute l'application.",
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Curseur main',
                description: 'Afficher un curseur main au survol des éléments interactifs.',
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Langue', description: "Choisis la langue de l'interface." } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Barre latérale',
                description: 'Choisir les éléments du menu visibles dans la barre latérale.',
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'À propos' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Version web', description: "Build de l'interface déployée (commit inclus)." } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Version API', description: 'Commit du service API déployé.' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Parité release',
                description: 'Le commit web et le commit API doivent correspondre au code testé.',
              },
            },
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
          content: { title: 'Je n’ai pas pu charger tes préférences.', description: 'Réessaie dans un instant.' },
        },
      },
    ],
  },
  uxNotes: [
    SETTINGS_GROUPS_DECISION,
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    RESPONSIVE_ECART_ROW,
    {
      kind: 'ecart',
      text: 'RUX-39 (docs/revue-ux.md §2 P3) : le code garde encore trois portes vers la même famille de fonctionnalités (checklist de démarrage, visite guidée, scénario commercial) empilées dans « Démarrage » — chacune reformule « relancer/revoir » différemment (#2731, #2731.2). La maquette cible UN bouton, « Revoir la prise en main », qui ouvre un menu à ces trois choix.',
      source: 'apps/web/src/features/settings/view/PreferencesView.tsx:143',
    },
    {
      kind: 'decision',
      text: 'RUX-39 (docs/revue-ux.md §2 P3, Top 20 non retenu) : « Démarrage » devient UN bouton, « Revoir la prise en main », qui ouvre un menu à 3 choix (checklist, visite guidée, scénario commercial) — jamais trois lignes de réglage qui disent chacune « relancer » ou « revoir » à sa façon.',
      source: 'apps/web/src/features/settings/view/PreferencesView.tsx:143',
    },
  ],
}
