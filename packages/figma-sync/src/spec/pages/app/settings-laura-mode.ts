import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_GROUPS_DECISION,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/laura-mode — Laura, mode par défaut (#2451.9). Lu dans
 * `apps/web/src/routes/settings/laura-mode.tsx` → `SettingsPage` →
 * `LauraModeSettingsView.tsx` : un choix unique (trois modes) qui pose la
 * valeur de repli d'une conversation NEUVE avec Laura — un fil qui a déjà
 * reçu un choix explicite garde toujours la priorité (#2451.6). Ce n'est PAS
 * Réglages › Règles d'espace (#2081.14) : celui-là RESTREINT un droit, celui-ci
 * pose une valeur de repli. Textes de `i18n/locales/fr/workspaceRules.json`
 * (`lauraDefaultMode.*`).
 */
export const settingsLauraModePage: PageSpec = {
  id: 'app/settings-laura-mode',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/laura-mode.tsx',
  title: 'Laura — mode par défaut',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Laura — mode par défaut', style: 'title' },
      {
        type: 'text',
        text: 'Le mode de contexte qu’une conversation neuve utilise tant que personne n’en choisit un autre. Ce n’est pas une règle d’espace : il ne retire aucun droit, il pose seulement une valeur de repli.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Mode par défaut d’une conversation neuve',
            description:
              'Un fil qui a déjà reçu un choix explicite garde toujours la priorité — ce réglage ne s’applique qu’aux conversations neuves.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'RadioGroup',
            props: {
              state: 'default',
              content: { legend: 'Mode par défaut d’une conversation neuve' },
              items: ['Mon activité', 'Mission ponctuelle', 'Neutre'],
            },
          },
          {
            type: 'text',
            text: 'Mon activité : profil, portefeuille et CRM lus — le comportement d’avant ce réglage. Mission ponctuelle : seuls le brief de la conversation et le compte sélectionné, si un compte est cadré. Neutre : seules la demande et les sources publiques.',
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
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Je n’ai pas pu lire ce réglage.', description: 'Réessaie.', action: 'Réessayer' },
        },
      },
    ],
  },
  uxNotes: [
    SETTINGS_GROUPS_DECISION,
    {
      kind: 'decision',
      text: 'Le mode « Mon activité » reproduit le comportement d’avant ce réglage (profil, portefeuille et CRM lus) : personne ne perd de contexte en migrant, le repli neutre est un choix explicite, jamais la valeur d’usine.',
      source: 'apps/web/src/features/work-contexts/lib/laura-mode-settings-api.ts:1',
    },
    {
      kind: 'decision',
      text: 'Tout membre LIT ce réglage (le mode par défaut d’un fil neuf n’est pas un fait privilégié) ; seul le propriétaire de l’espace ou un administrateur le change. Un non-administrateur voit la même page, radios désactivées, avec la note « Seul un administrateur de l’espace peut changer ce réglage. »',
      source: 'apps/web/src/features/settings/view/LauraModeSettingsView.tsx:65',
    },
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
  ],
}
