import type { PageSpec } from '../../types'

/**
 * /contacts/import — refonte Théo (23/10/2026). Lu dans :
 * `apps/web/src/routes/contacts/import.tsx` → `ImportAssistantPage.tsx`. Textes de `i18n/locales/fr/importWizard.json (`contactsImport.assistant.*`)`.
 */
export const contactsImportPage: PageSpec = {
  id: 'app/contacts-import',
  surface: 'app',
  domain: 'contacts',
  route: 'apps/web/src/routes/contacts/import.tsx',
  title: 'Importer des contacts',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Importer des contacts', style: 'title' }],
    progress: [{ type: 'text', text: 'Étape 1', style: 'caption', color: 'text/secondary' }],
    primary: [
      {
        type: 'text',
        text: 'Un parcours en étapes pour amener des contacts dans l’espace depuis une source.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Retour' } },
      },
      { type: 'component', component: 'Button', props: { size: 'sm', content: { label: 'Continuer' } } },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Cet écran n’a pas pu se charger. Rien n’a changé.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'La source se lit dans l’adresse (`?source=`) ; une source inconnue ramène au choix. Le lien « Imports & sources » ramène à la liste des sources.',
      source: 'apps/web/src/features/contacts-import/view/ImportAssistantPage.tsx:24',
    },
  ],
}
