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
 * /settings/pipeline — Durées cibles du pipe (PDF 3 §3.5). Lu dans
 * `apps/web/src/routes/settings/pipeline.tsx` → `PipelineSlaView.tsx` : une
 * ligne par étape du pipe (durée cible en jours, défaut ou réglée par
 * l'espace), l'étape « Gagné » sans durée cible. Textes de
 * `i18n/locales/fr/pipelineSla.json`.
 */
export const settingsPipelinePage: PageSpec = {
  id: 'app/settings-pipeline',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/pipeline.tsx',
  title: 'Durées cibles du pipe',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Durées cibles du pipe', style: 'title' },
      {
        type: 'text',
        text: "Combien de temps une affaire peut rester à une étape avant qu'on te le signale. Ce n'est pas une contrainte : c'est un révélateur.",
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Par étape' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Qualification', description: '7 jours — valeur par défaut' } },
            children: [{ type: 'component', component: 'Input', props: { content: { value: '7' } } }],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Proposition', description: '14 jours — réglé par ton espace' } },
            children: [{ type: 'component', component: 'Input', props: { content: { value: '14' } } }],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Négociation', description: '10 jours — valeur par défaut' } },
            children: [{ type: 'component', component: 'Input', props: { content: { value: '10' } } }],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Gagné', description: 'une affaire gagnée ne vieillit pas' } },
          },
          // RUX-21 : UN bouton « Enregistrer » pour le GROUPE des trois étapes réglables, dans le pied.
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
        props: { content: { title: 'Je n’ai pas pu lire les durées cibles.', description: 'Réessayer' } },
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
      text: 'L’étape « Gagné » n’a pas de durée cible et n’EN ACCEPTE PAS (pas de champ éditable) : une affaire signée ne vieillit pas dans sa colonne — différent d’un « non renseigné » qui, lui, reste réglable.',
      source: 'apps/web/src/features/settings/view/PipelineSlaView.tsx:143',
    },
  ],
}
