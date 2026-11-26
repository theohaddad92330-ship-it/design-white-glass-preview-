import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_GROUPS_DECISION,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/team — Équipe. Lu dans `apps/web/src/routes/settings/team.tsx` →
 * `TeamView.tsx` : entête (sièges utilisés/total), formulaire d'invitation,
 * table des membres (rôle, permissions), table des invitations en attente,
 * bandeau lecture seule pour un rôle sans droit d'écriture. Textes de
 * `i18n/locales/fr/team.json`.
 */
export const settingsTeamPage: PageSpec = {
  id: 'app/settings-team',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/team.tsx',
  title: 'Équipe',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Équipe', style: 'title' },
      {
        type: 'text',
        text: 'Gère les membres de ton espace de travail et leurs accès.',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: '4 / 10 sièges' } } },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            title: 'Lecture seule',
            description: 'Seuls le propriétaire, les admins et les Sales Ops peuvent inviter ou retirer des membres.',
          },
        },
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Inviter un collaborateur' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Input',
                props: { content: { placeholder: 'collaborateur@ton-esn.fr' } },
              },
              { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Inviter' } } },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Membres (4)' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Membre', 'Rôle', 'Permissions', ''],
                rows: [
                  ['Compte exemple (tu)', 'Propriétaire', '—', '—'],
                  ['Compte exemple 2', 'Admin', '—', 'Retirer'],
                  ['Compte exemple 3', 'Sales Ops', '+2', 'Retirer'],
                  ['Compte exemple 4', 'Lecteur', '—', 'Retirer'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Invitations en attente (1)' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: { table: { columns: ['Email', 'Expire', ''], rows: [['nouveau@ton-esn.fr', '—', 'Annuler']] } },
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger l’équipe.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    SETTINGS_GROUPS_DECISION,
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'Le rôle Lecteur reçoit le même bandeau que « tout autre rôle sans droit » (`readOnly.viewer` / `readOnly.other`) mais avec un texte différent — deux formulations d’un même fait (« tu ne peux pas modifier l’équipe ») plutôt qu’un seul message paramétré par rôle.',
      source: 'apps/web/src/i18n/locales/fr/team.json:78',
    },
  ],
}
