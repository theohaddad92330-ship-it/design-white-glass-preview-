import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/catalogues — Listes métier (BEL-CRM-105). Lu dans
 * `apps/web/src/routes/settings/catalogues.tsx` → `CataloguesPage.tsx` : les
 * catalogues éditables d'abord (motifs de perte, libellés d'étapes…), les
 * référentiels en lecture seule repliés, chacun avec ses valeurs et un ajout.
 * Textes de `i18n/locales/fr/catalogues.json`.
 */
export const settingsCataloguesPage: PageSpec = {
  id: 'app/settings-catalogues',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/catalogues.tsx',
  title: 'Listes métier',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Adapte le vocabulaire de ton ESN', style: 'title' },
      {
        type: 'text',
        text: 'Configure les listes que ton équipe utilise pour expliquer pourquoi une affaire est perdue, un compte mis en pause, ou un besoin impossible à staffer.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Button',
        props: {
          variant: 'link',
          content: { label: 'Les compétences à rapprocher ont déménagé dans Pilotage › Qualité des données' },
        },
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Motifs de perte de projet',
            description: 'Pourquoi une affaire est perdue. Ce sont ces motifs qu’on relit en revue.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'FilterChips',
            props: { size: 'md', items: ['Budget', 'Concurrent retenu', 'Délai trop long', 'Sans réponse'] },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              { type: 'component', component: 'Input', props: { content: { placeholder: 'Ajouter un motif' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Ajouter' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Libellés des étapes du pipe',
            description: 'Le nombre et l’ordre des cinq étapes sont figés ; seuls leurs noms se renomment.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Étape 1', value: 'Qualification' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Étape 2', value: 'Proposition' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Button',
        props: {
          variant: 'ghost',
          size: 'sm',
          content: { label: 'Voir les référentiels BellumAI en lecture seule (2)' },
        },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger les catalogues.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'Les listes MODIFIABLES par l’espace passent avant les référentiels BellumAI en lecture seule, repliés par défaut — ce qui appelle une décision d’abord, ce qu’on ne peut pas changer ensuite.',
      source: 'apps/web/src/features/catalogues/view/CataloguesPage.tsx:62',
    },
    {
      kind: 'decision',
      text: 'La file des compétences à rapprocher a DÉMÉNAGÉ vers Pilotage › Qualité des données (#1527) : un lien reste ici pour qui la cherchait à cette adresse plutôt que de la faire disparaître sans trace.',
      source: 'apps/web/src/features/catalogues/view/CataloguesPage.tsx:56',
    },
  ],
}
