import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SAVE_MODEL_DECISION,
  SETTINGS_SECTION_NAV,
  VALIDATION_DECISION,
} from './settings-shared'

/**
 * /settings/finance — Seuil de marge (#2420.17). Lu dans
 * `apps/web/src/routes/settings/finance.tsx` → `FinanceSettingsView.tsx` :
 * un seul réglage — le seuil d'alerte de marge commerciale, en %, avec
 * enregistrer / remettre à « non réglé ». Textes de
 * `i18n/locales/fr/financeSettings.json`.
 */
export const settingsFinancePage: PageSpec = {
  id: 'app/settings-finance',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/finance.tsx',
  title: 'Seuil de marge',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Seuil d’alerte de marge commerciale', style: 'title' },
      {
        type: 'text',
        text: 'Sous ce seuil de marge COMMERCIALE, une mission déclenche l’alerte de seuil ET le diagnostic de marge basse de Laura.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Seuil de l’espace' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Seuil d’alerte de marge, en pourcentage',
                description: 'aucune alerte ne se déclenche, ni le diagnostic de Laura',
              },
            },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              { type: 'component', component: 'Input', props: { content: { placeholder: 'non réglé' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Remettre à « non réglé »' } },
              },
            ],
          },
          // RUX-21 : UN bouton « Enregistrer » PAR GROUPE, dans le pied — jamais un bouton par champ.
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
        props: {
          content: {
            title: 'Réservé aux gestionnaires de la marge',
            description: 'Le seuil d’alerte de marge est une donnée financière de l’espace.',
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
    SAVE_MODEL_DECISION,
    VALIDATION_DECISION,
    {
      kind: 'decision',
      text: '« Non réglé » n’est jamais `0` : un seuil absent s’affiche avec sa raison nommée (`UnknownValue`), jamais un défaut inventé (doctrine, gardes GA-18/GA-19).',
      source: 'apps/web/src/features/settings/view/FinanceSettingsView.tsx:123',
    },
    {
      kind: 'decision',
      text: 'Qui peut LIRE la marge mais pas la régler voit la valeur, jamais un formulaire qui rendrait 403 — la permission `finance:write` reprend exactement celle de l’API, pas une nouvelle.',
      source: 'apps/web/src/features/settings/view/FinanceSettingsView.tsx:150',
    },
  ],
}
