import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/branding — Marque (marque blanche, 01/09/2026). Lu dans
 * `apps/web/src/routes/settings/branding.tsx` → `BrandingView.tsx` : identité
 * (nom, nom du copilote, logo, accent), domaine personnalisé + adresse
 * d'expédition, aperçu en direct du brouillon. Textes de
 * `i18n/locales/fr/branding.json`.
 */
export const settingsBrandingPage: PageSpec = {
  id: 'app/settings-branding',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/branding.tsx',
  title: 'Marque',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Marque', style: 'title' },
      {
        type: 'text',
        text: "Ce que tes partenaires et tes clients voient quand ils ouvrent l'espace : le nom, le logo, la couleur, le domaine.",
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Identité', description: 'Le nom remplace « BellumAI » partout.' } },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Nom affiché', placeholder: 'Le nom que tes clients voient' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Nom du copilote', placeholder: 'Le nom de ton copilote' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Adresse du logo', placeholder: 'https://…/logo.svg' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Couleur d’accent', placeholder: '#5b3ee8' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Domaine',
            description: "Fais pointer un sous-domaine à toi vers l'application.",
          },
        },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Domaine personnalisé', placeholder: 'app.tonentreprise.fr' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Adresse d’expédition', placeholder: 'notifications@tonentreprise.fr' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Aperçu', description: 'Ce que porte l’entête avec les réglages en cours.' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            justify: 'between',
            fill: 'surface/2',
            radius: 'md',
            padding: '4',
            children: [
              { type: 'component', component: 'BrandMark', props: { size: 'md' } },
              { type: 'text', text: 'Marque du produit', style: 'caption', color: 'text/secondary' },
            ],
          },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Enregistrer' } } },
          { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Annuler' } } },
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
        props: { content: { title: 'Je n’ai pas pu charger la marque.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'L’aperçu lit le BROUILLON en cours de saisie, jamais la marque déjà enregistrée (`useBrand()` aurait produit un aperçu qui ne change qu’APRÈS l’enregistrement — l’inverse d’un aperçu).',
      source: 'apps/web/src/features/settings/view/BrandingView.tsx:229',
    },
    {
      kind: 'decision',
      text: 'Réservé au propriétaire et aux administrateurs : la marque change ce que TOUT LE MONDE voit, y compris les clients de l’espace.',
      source: 'apps/web/src/i18n/locales/fr/branding.json:4',
    },
  ],
}
