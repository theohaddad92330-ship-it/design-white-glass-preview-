import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/security — Sécurité. Lu dans
 * `apps/web/src/routes/settings/security.tsx` → `SecurityView.tsx` (deux
 * groupes : Authentification, Confidentialité RGPD) → `TwoFactorRow.tsx`,
 * `ActiveSessionsRow.tsx`, `DataExportRow.tsx`, `DeleteAccountRow.tsx`.
 * Textes de `i18n/locales/fr/settings.json` (`security.*`).
 */
export const settingsSecurityPage: PageSpec = {
  id: 'app/settings-security',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/security.tsx',
  title: 'Sécurité',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Sécurité', style: 'title' },
      {
        type: 'text',
        text: 'Authentification, sessions actives et export de tes données.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Authentification' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Double authentification',
                description: "Protège ton compte avec une application d'authentification (TOTP).",
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Sessions actives', description: 'Session actuelle · autres appareils.' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Confidentialité (RGPD)' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Exporter mes données',
                description: "Le compte par objet, le format CSV ou JSON, et ce que tu n'emportes pas",
              },
            },
          },
        ],
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'DangerZone',
        props: { content: { title: 'Supprimer mon compte' } },
        children: [
          {
            type: 'text',
            text: 'Anonymise tes données, révoque tes sessions et annule ton abonnement. Irréversible.',
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'destructive', size: 'sm', content: { label: 'Supprimer mon compte' } },
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
          content: { title: 'Impossible de lire tes sessions actives.', description: 'Réessaie dans un instant.' },
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
      text: 'La suppression de compte va dans le slot `footer` (zone de danger), séparée visuellement du groupe « Confidentialité (RGPD) » où le code la range aujourd’hui comme une `SettingsRow` ordinaire (bouton contour teinté rouge) — jamais une ligne parmi d’autres.',
      source: 'apps/web/src/features/settings/components/security/DeleteAccountRow.tsx:19',
    },
  ],
}
