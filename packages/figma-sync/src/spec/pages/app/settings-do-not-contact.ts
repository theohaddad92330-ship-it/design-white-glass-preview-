import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/do-not-contact — Ne pas contacter (#4158.22, mode équipe 14/10/2026).
 * Lu dans `apps/web/src/routes/settings/do-not-contact.tsx` → `DoNotContactView.tsx` :
 * la liste de l'espace (contacts et domaines), avec motif et auteur ; tout membre
 * propose, retirer demande de gérer l'équipe. Textes de
 * `i18n/locales/fr/teamGuardrails.json` (`dnc`).
 */
export const settingsDoNotContactPage: PageSpec = {
  id: 'app/settings-do-not-contact',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/do-not-contact.tsx',
  title: 'Ne pas contacter',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ne pas contacter', style: 'title' },
      {
        type: 'text',
        text: 'La liste de l’espace : un contact ou un domaine que personne ne doit solliciter, avec le motif et l’auteur. Tout membre peut proposer une entrée ; retirer demande de gérer l’équipe.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Ajouter un domaine' } },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Domaine', placeholder: 'exemple.fr' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Motif (obligatoire)', placeholder: 'Pourquoi ne pas les solliciter ?' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', content: { label: 'Ajouter à la liste' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsRow',
        props: { content: { label: 'Domaine · exemple.fr', description: 'Ajouté par Léa Marchand le 14/10/2026' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'La liste n’a pas pu être chargée.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'Un contact s’ajoute depuis sa fiche (« Ne pas contacter (équipe) »), un domaine depuis cet écran ; le motif est obligatoire. Retirer n’efface pas : l’historique est conservé (« on archive, on ne supprime pas »).',
      source: 'apps/web/src/features/team-guardrails/components/DoNotContactView.tsx:44',
    },
  ],
}
