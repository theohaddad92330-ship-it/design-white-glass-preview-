import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/memory — Mémoire de Laura (tome 6 §12.1 : « l'utilisateur voit
 * cette mémoire, en clair, et peut en supprimer n'importe quelle ligne »). Lu
 * dans `apps/web/src/routes/settings/memory.tsx` → `MemoryLedgerView.tsx` :
 * « Tout oublier », « Ce qui n'est jamais mémorisé », les couches (faits
 * épinglés, préférences, objectifs personnels, règles de l'ESN), et le
 * réglage du style de réponse. Textes de `i18n/locales/fr/knowledge.json`
 * (`memoryLedger.*`).
 */
export const settingsMemoryPage: PageSpec = {
  id: 'app/settings-memory',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/memory.tsx',
  title: 'Ce que Laura garde en tête',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ce que Laura garde en tête', style: 'title' },
      {
        type: 'text',
        text: "Tout ce qui est retenu, en clair. Chaque ligne s'oublie d'un clic — et une ligne oubliée disparaît aussi du contexte que Laura relit.",
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Tout oublier' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Tout oublier' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Comment Laura te répond',
            description: 'Ces réglages changent la forme de ses réponses, jamais le fond.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Longueur des réponses', description: 'Courtes · Détaillées' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Ton', description: 'Direct · Pédagogique' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Format préféré', description: 'Texte · Listes' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Explication des sources', description: 'Minimale · Détaillée' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Ce que tu as épinglé',
            description:
              'Les faits, préférences et corrections épinglés à la main ou retenus d’une réponse. Chacun vaut pour toi uniquement ou pour toute ton ESN.',
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
                props: { content: { label: 'Compte exemple 1 · préférence', value: 'Oublier' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Compte exemple 2 · correction', value: 'Oublier' } },
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
            title: 'Préférences personnelles',
            description: 'Ta façon de travailler — personne d’autre ne les voit.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'EmptyState',
            props: { size: 'sm', align: 'start', content: { title: 'Aucune préférence retenue pour toi.' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Objectifs personnels',
            description: 'Ce que tu vises, épinglé pour toi seul.',
          },
        },
        children: [
          {
            type: 'text',
            text: 'Ton objectif et ta cible viennent de ton questionnaire de profil. Ils se corrigent là où tu les as saisis.',
            style: 'caption',
            color: 'text/secondary',
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Règles de l’ESN', description: 'Ce qui vaut pour toute ton ESN.' } },
        children: [
          {
            type: 'component',
            component: 'EmptyState',
            props: { size: 'sm', align: 'start', content: { title: 'Aucune règle partagée avec ton ESN.' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Ce que Laura ne mémorise jamais' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Le contenu de tes messages', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Les données d’un autre espace', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Ce qui appartient à un collègue hors de ton périmètre', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Ce que tu as oublié', value: '—' } },
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
            title: 'La mémoire n’a pas pu être lue.',
            description: 'Rien n’est affiché parce que rien n’a été lu — pas parce que Laura ne retient rien.',
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
    {
      kind: 'decision',
      text: 'Une couche illisible n’affiche jamais « aucune ligne » : elle dit qu’elle n’a pas pu être lue et reste distincte d’une couche vide (`unreadable` ≠ `empty`).',
      source: 'apps/web/src/features/memory/view/MemoryLedgerView.tsx:166',
    },
    {
      kind: 'decision',
      text: '« Tout oublier » archive, ne détruit pas : une ligne oubliée quitte l’écran et le contexte relu par Laura, mais les faits épinglés par des collègues et le profil restent — dits explicitement dans la confirmation.',
      source: 'apps/web/src/features/memory/view/MemoryLedgerView.tsx:136',
    },
  ],
}
