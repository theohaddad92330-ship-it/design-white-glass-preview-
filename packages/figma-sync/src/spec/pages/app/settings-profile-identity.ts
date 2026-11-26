import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/profile/identity — Identité (édition). Lu dans
 * `apps/web/src/routes/settings/profile/identity.tsx` →
 * `ProfileIdentityPage.tsx` : prénom, nom, email (confirmé par code),
 * fuseau horaire (détecté ou choisi), signature de messagerie. Textes de
 * `i18n/locales/fr/profile.json` (`identity.*`).
 */
export const settingsProfileIdentityPage: PageSpec = {
  id: 'app/settings-profile-identity',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/profile/identity.tsx',
  title: 'Identité',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'Button', props: { variant: 'ghost', size: 'sm', content: { label: 'Retour' } } },
      { type: 'text', text: 'Identité', style: 'title' },
      {
        type: 'text',
        text: 'Ton nom et prénom apparaissent dans ton espace personnel.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Identité' } },
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'Prénom', placeholder: 'Jean' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Nom', placeholder: 'Dupont' } } },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Email',
                description: "Le changement d'email est confirmé par un code envoyé à la nouvelle adresse.",
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Fuseau horaire',
                description: 'Tant que rien n’est enregistré, le fuseau de référence est Europe/Paris.',
              },
            },
          },
          { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Enregistrer' } } },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Ta signature de messagerie',
            description:
              "Elle est ajoutée au bas des brouillons que BellumAI prépare. Vide, c'est celle de ta messagerie qui s'applique.",
          },
        },
        children: [{ type: 'component', component: 'Textarea', props: { content: { placeholder: 'Ta signature' } } }],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger ton identité.', description: 'Réessaie.' } },
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
      text: 'Le fuseau horaire proposé (détecté du navigateur) n’est pas silencieusement appliqué : « Tant que rien n’est enregistré, le fuseau de référence est Europe/Paris » — une proposition n’est jamais confondue avec une valeur enregistrée.',
      source: 'apps/web/src/features/profile/view/ProfileIdentityPage.tsx:28',
    },
  ],
}
