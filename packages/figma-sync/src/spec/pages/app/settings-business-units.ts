import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/business-units — Périmètres (#2005.5). Lu dans
 * `apps/web/src/routes/settings/business-units.tsx` →
 * `BusinessUnitAdminView.tsx` : une fiche par BU/agence/équipe (capacité
 * disponible, objectif du trimestre, effectif, taille d'équipe, note de
 * portefeuille), éditable et enregistrée une à une. Textes de
 * `i18n/locales/fr/businessUnitsAdmin.json`.
 */
export const settingsBusinessUnitsPage: PageSpec = {
  id: 'app/settings-business-units',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/business-units.tsx',
  title: 'Périmètres',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Périmètres de l’espace', style: 'title' },
      {
        type: 'text',
        text: 'Capacité disponible, objectif du trimestre, effectif — la fiche de chaque agence, BU ou équipe de ton ESN.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Agence Paris' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Consultants disponibles', description: '12 consultants disponibles' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Objectif du trimestre', description: '—' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Effectif', description: '34 consultants' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Taille d’équipe', description: '—' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Enregistrer' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'BU Delivery Sud' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Consultants disponibles', description: '—' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Objectif du trimestre', description: '—' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Enregistrer' } },
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
        props: { content: { title: 'Je n’ai pas pu lire les périmètres.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'Une valeur non réglée ne s’affiche jamais « 0 » — `UnknownValue` porte sa raison (`fields.unset`), cohérent avec la doctrine (gardes GA-18/GA-19).',
      source: 'apps/web/src/features/business-units/view/BusinessUnitAdminView.tsx:258',
    },
  ],
}
