import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_GROUPS_DECISION,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/import — Import de données (PDF 7 §7, reprendre une base
 * héritée). Lu dans `apps/web/src/routes/settings/import.tsx` →
 * `ImportWizard.tsx` : un assistant à 7 étapes (choisir la source, déposer,
 * reconnaître, normaliser, dédoublonner, simuler, importer), rien n'est
 * écrit avant la simulation. Textes de `i18n/locales/fr/importWizard.json`.
 */
export const settingsImportPage: PageSpec = {
  id: 'app/settings-import',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/import.tsx',
  title: 'Import de données',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Donne à BellumAI ton historique, même sans connecter tes outils.', style: 'title' },
      {
        type: 'text',
        text: 'Importe tes exports CRM, ATS, comptes, contacts, missions ou anciens fichiers.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'Stepper',
        props: {
          orientation: 'horizontal',
          items: ['Choisir la source', 'Déposer', 'Reconnaître', 'Normaliser', 'Dédoublonner', 'Simuler', 'Importer'],
        },
      },
      { type: 'text', text: '0 étape faite sur 7', style: 'caption', color: 'text/muted' },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Choisir cette source' } },
        children: [
          {
            type: 'grid',
            columns: 3,
            columnsMobile: 1,
            gap: '3',
            children: [
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'CRM (CSV)', description: 'Colonnes nécessaires : nom, email, téléphone' } },
              },
              {
                type: 'component',
                component: 'Card',
                props: {
                  content: { title: 'ATS (CSV)', description: 'Colonnes nécessaires : nom, statut, provenance' },
                },
              },
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Fichier générique', description: 'Reconnaissance manuelle des colonnes' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', content: { label: 'Télécharger un modèle' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            title: 'Rien n’est écrit',
            description: 'Rien n’est écrit tant que tu n’as pas vu la simulation.',
          },
        },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          { type: 'component', component: 'Button', props: { variant: 'outline', content: { label: 'Simuler' } } },
          { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Importer' } } },
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
        props: { content: { title: 'Impossible d’ouvrir la session d’import.', description: 'Réessaie.' } },
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
      text: 'Gabarit `settings` conservé (pas `wizard`) : la route reste enveloppée par `SettingsPage`, donc la nav de section IDENTIQUE à toutes les pages de Réglages reste visible — seul le contenu de `primary` suit un déroulé en étapes.',
      source: 'apps/web/src/features/import/view/ImportWizard.tsx:796',
    },
    {
      kind: 'ecart',
      text: 'Le rail d’étapes réel (`StepRail`) porte SEPT statuts par étape (done/current/todo) ; `Stepper` du catalogue n’a pas de variante par item — seul le texte « 0 étape faite sur 7 » juste en dessous porte la progression dans la maquette.',
      source: 'apps/web/src/features/import/view/ImportWizard.tsx:796',
    },
    {
      kind: 'decision',
      text: 'Un import qui s’arrête au milieu ne perd rien : ce qui est déjà créé/mis à jour EST en base, et la reprise repart exactement où ça s’est arrêté — jamais recommencé de zéro.',
      source: 'apps/web/src/i18n/locales/fr/importWizard.json:126',
    },
  ],
}
