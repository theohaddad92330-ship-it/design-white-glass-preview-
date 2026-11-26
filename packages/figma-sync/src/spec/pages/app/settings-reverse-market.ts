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
 * /settings/reverse-market — Marché inversé (#2035.10, 18/09/2026). Lu dans
 * `apps/web/src/routes/settings/reverse-market.tsx` →
 * `ReverseMarketSettingsView.tsx` : activer/désactiver, capacité de réponse
 * (sollicitations/semaine), recruteurs affichés par consultant. Textes de
 * `i18n/locales/fr/reverseMarketSettings.json`.
 */
export const settingsReverseMarketPage: PageSpec = {
  id: 'app/settings-reverse-market',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/reverse-market.tsx',
  title: 'Marché inversé',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Marché inversé', style: 'title' },
      {
        type: 'text',
        text: 'Où placer un profil sur le marché externe, combien de sollicitations ton espace accepte de traiter, et combien de recruteurs remonter par consultant.',
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
            props: {
              content: {
                label: 'Marché inversé activé',
                description:
                  'Ouvre la lecture du marché externe et des ESN qui recrutent, depuis la fiche d’un consultant.',
              },
            },
            // RUX-21 : bascule → enregistrement IMMÉDIAT, indicateur « Enregistré » 2 s, jamais de toast.
            children: [
              { type: 'component', component: 'Switch', props: { checked: 'on', state: 'default' } },
              { type: 'text', text: 'Enregistré', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Capacité de réponse', description: 'non renseignée' } },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              { type: 'component', component: 'Input', props: { content: { placeholder: 'non renseignée' } } },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Recruteurs affichés par consultant', description: 'non renseigné' } },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [{ type: 'component', component: 'Input', props: { content: { placeholder: 'non renseigné' } } }],
          },
          // RUX-21 : UN bouton « Enregistrer » pour le groupe des deux champs liés, dans le pied.
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
      text: 'Même famille que la charge commerciale et le seuil de marge : « non renseigné(e) » est un inconnu nommé (`UnknownValue`), jamais `0`.',
      source: 'apps/web/src/features/settings/view/ReverseMarketSettingsView.tsx:135',
    },
    {
      kind: 'decision',
      text: 'Fusionné le 21/09 (#2035.10/#2035.11) : ce qui s’appelait « Priorisation commerciale » mêlait deux sujets (marché externe, charge commerciale) — un seul écran par sujet désormais.',
      source: 'apps/web/src/components/sidebar/items.settings.ts:143',
    },
  ],
}
