import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/profile — Mon profil (page d'atterrissage, lecture seule). Lu
 * dans `apps/web/src/routes/settings/profile/index.tsx` → `ProfilePage.tsx` :
 * une carte par section (identité, mes périmètres, profil ESN, contextes de
 * travail, revoir mes réponses, mémoire marché, portefeuille d'offre, profil
 * BellumAI, sécurité, zone de danger), chacune n'affichant qu'un RÉSUMÉ —
 * « l'édition se passe sur les pages `/settings/profile/$stage` dédiées »
 * (docblock `ProfilePage.tsx:20`). Textes de `i18n/locales/fr/profile.json`.
 */
export const settingsProfileIndexPage: PageSpec = {
  id: 'app/settings-profile',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/profile/index.tsx',
  title: 'Mon profil',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Mon profil', style: 'title' },
      {
        type: 'text',
        text: 'Gère les informations de ton ESN et la sécurité de ton compte.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Identité', description: 'Visible dans ton espace personnel.' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Nom et prénom', description: '—', value: 'À compléter' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Mes périmètres',
            description: 'Les BU, agences ou équipes dont tu fais partie.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Agence Paris', description: 'Tu en fais partie', value: '—' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Profil ESN', description: 'Modifiable à tout moment.' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: { label: 'Profil de l’entreprise', description: 'Partagé avec toute l’équipe', value: '—' },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Contextes de travail' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Variantes de profil',
                description: 'Une variante sans toucher au profil principal.',
                value: '—',
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Revoir mes réponses' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Questionnaire de profil', description: '—', value: '—' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Ton entreprise dans la mémoire marché' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Voilà ce que BellumAI observe', description: '—', value: '—' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Portefeuille d’offre',
            description: 'Ce que ton entreprise vend, à quels secteurs, sur quels sites.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Ce que BellumAI a compris', description: '—', value: '—' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Profil BellumAI' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Résumé, personnalisation et coaching',
                description: 'Sera disponible après la première génération.',
                value: '—',
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Sécurité', description: 'Gère ton mot de passe et l’accès à ton compte.' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Mot de passe', description: 'Tu recevras un email pour le réinitialiser.' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'DangerZone',
        props: { content: { title: 'Zone de danger' } },
        children: [
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
        props: { content: { title: 'Je n’ai pas pu lire ton profil.', description: 'Réessaie.' } },
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
      text: 'Cette page N’ÉDITE rien : chaque ligne n’affiche qu’un résumé et navigue vers une page `/settings/profile/$stage` dédiée pour éditer — jamais un formulaire ouvert ici même.',
      source: 'apps/web/src/features/profile/view/ProfilePage.tsx:20',
    },
    {
      kind: 'decision',
      text: '« Sécurité » et « Zone de danger » de ce même profil dupliquent partiellement `/settings/security` (mot de passe ici, 2FA/sessions/export/suppression là-bas) — même sujet, deux endroits, à vérifier contre GA-26.',
      source: 'apps/web/src/features/profile/components/SecuritySection.tsx:28',
    },
  ],
}
