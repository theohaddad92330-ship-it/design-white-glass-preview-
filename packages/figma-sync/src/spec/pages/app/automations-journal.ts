import type { PageSpec } from '../../types'

/**
 * /actions/automatisations/journal — le journal des essais (Théo C automations-bibliotheque.N3). Lu dans
 * `apps/web/src/routes/actions/automatisations_/journal.tsx` → `AutomationTrialsJournalPage.tsx` : entête, sous-onglets,
 * une carte par essai (règle, genre d’essai, situations lues avec leurs comptes, ce qu’elle aurait préparé, lien vers la
 * règle). Textes de `apps/web/src/i18n/locales/fr/routines.json` (`journal.*`).
 */
export const automationsJournalPage: PageSpec = {
  id: 'app/automations-journal',
  surface: 'app',
  domain: 'actions',
  route: 'apps/web/src/routes/actions/automatisations_/journal.tsx',
  title: 'Journal des essais',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Le journal de tes essais', style: 'title' },
      {
        type: 'text',
        text: 'Ce qui a été testé avant d’être conservé. Un essai n’est jamais une preuve d’envoi réel.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Une fin de mission approche' } },
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Aucun essai enregistré.',
            description: 'Teste une règle : le contrôle et son résultat apparaîtront ici.',
            action: 'Créer avec Laura',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Le journal n’a pas pu être lu.', description: 'Réessaie dans un instant.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un essai qui n’a rien pu lire se nomme (« Impossible : … ») et ne compte rien : jamais « 0 situation » quand on n’a rien lu.',
      source: 'apps/web/src/features/automations/view/AutomationTrialsJournalPage.tsx:1',
    },
  ],
}
