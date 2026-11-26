import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SAVE_MODEL_DECISION,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/commercial-load — Charge commerciale (#2035.11, 18/09/2026). Lu
 * dans `apps/web/src/routes/settings/commercial-load.tsx` →
 * `CommercialLoadSettingsView.tsx` : deux plafonds (dossiers suivis, besoins
 * ouverts) au maximum par commercial. Textes de
 * `i18n/locales/fr/commercialLoadSettings.json`.
 */
export const settingsCommercialLoadPage: PageSpec = {
  id: 'app/settings-commercial-load',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/commercial-load.tsx',
  title: 'Charge commerciale',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Charge commerciale', style: 'title' },
      {
        type: 'text',
        text: 'Les plafonds qui aident à prioriser : combien de dossiers et de besoins ouverts un commercial peut porter.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Réglages' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Dossiers suivis, au maximum', description: 'non renseigné' } },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [{ type: 'component', component: 'Input', props: { content: { placeholder: 'non renseigné' } } }],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Besoins ouverts, au maximum', description: 'non renseigné' } },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [{ type: 'component', component: 'Input', props: { content: { placeholder: 'non renseigné' } } }],
          },
          // RUX-21 : UN bouton « Enregistrer » pour tout le GROUPE de champs liés, dans le pied.
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            justify: 'end',
            children: [
              { type: 'component', component: 'Button', props: { variant: 'outline', content: { label: 'Annuler' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', state: 'disabled', content: { label: 'Enregistrer' } },
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
        props: { content: { title: 'Je n’ai pas pu lire ces réglages.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    RESPONSIVE_ECART_ROW,
    SAVE_MODEL_DECISION,
    {
      kind: 'decision',
      text: 'Même famille que le seuil de marge (`/settings/finance`) : un plafond non réglé s’affiche « non renseigné », jamais `0` ni un défaut deviné.',
      source: 'apps/web/src/features/settings/view/CommercialLoadSettingsView.tsx:150',
    },
  ],
}
