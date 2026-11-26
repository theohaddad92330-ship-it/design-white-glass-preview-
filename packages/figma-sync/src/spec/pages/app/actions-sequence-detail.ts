import type { PageSpec } from '../../types'

/**
 * /actions/sequences/$id — la page d'UNE séquence, avec son URL partageable. La matière est celle de la
 * feuille latérale (`SequenceDetailSheet`, `layout="page"`) : une seule implémentation du détail, deux coques.
 *
 * Lu dans : `apps/web/src/routes/actions/sequences_.$id.tsx` → `SequenceDetailRoutePage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/outreach.json` (`detail.*`).
 */
export const actionsSequenceDetailPage: PageSpec = {
  id: 'app/actions-sequence-detail',
  surface: 'app',
  domain: 'actions',
  route: 'apps/web/src/routes/actions/sequences_.$id.tsx',
  title: 'Séquence',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Séquence exemple 1', style: 'title' }],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir la fiche contact' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir le dossier' } },
      },
    ],
    summary: [
      {
        type: 'text',
        text: 'Condition d’arrêt : une réponse ou un refus ferme arrête la cadence — aucune relance ne suit.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    primary: [
      { type: 'text', text: 'La cadence, étape par étape', style: 'title' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Étape', 'État', 'Signal rapporté'],
            rows: [['Étape 1', 'À venir', 'Rien rapporté']],
          },
        },
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Cadre de cette campagne',
            description: 'Canal · Règles d’arrêt : réponse, opposition ou pause · Étapes réalisées',
          },
        },
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour aux séquences' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'text',
        text: 'Cette séquence n’existe pas (ou plus).',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un identifiant inconnu le DIT (« Cette séquence n’existe pas (ou plus). », avec « Retour aux séquences ») — jamais une page vide. La séquence se lit dans la liste du workspace : aucune route serveur de plus.',
      source: 'apps/web/src/features/outreach/view/SequenceDetailRoutePage.tsx:16',
    },
  ],
}
