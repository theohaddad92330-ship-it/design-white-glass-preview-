import type { PageSpec } from '../../types'

/**
 * /submissions/:id — le dossier de LECTURE d'un positionnement (#2953, #2973).
 * Lu dans `apps/web/src/routes/submissions/$id.tsx` → `SubmissionDossierPage.tsx` :
 * retour aux profils positionnés, puis une carte consultant / besoin / rôle
 * visé / étape / détail / date d'envoi du CV. Textes de
 * `apps/web/src/i18n/locales/fr/submissions.json` (clé `dossier`).
 */
export const submissionsDetailPage: PageSpec = {
  id: 'app/submissions-detail',
  surface: 'app',
  domain: 'consultants',
  route: 'apps/web/src/routes/submissions/$id.tsx',
  title: 'Dossier d’un positionnement',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour aux profils positionnés' } },
      },
      { type: 'text', text: 'Consultant exemple', style: 'title' },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Positionnement' } },
        children: [
          { type: 'text', text: 'Besoin : Affaire exemple', style: 'body' },
          { type: 'text', text: 'Rôle visé : aucun rôle précis désigné', style: 'body', color: 'text/secondary' },
          { type: 'text', text: 'Étape : CV envoyé', style: 'body' },
          { type: 'text', text: 'CV envoyé le : CV pas encore envoyé', style: 'body', color: 'text/secondary' },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Positionnement illisible',
            description: 'La lecture a échoué — le positionnement est toujours là.',
            action: 'Réessayer',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Volontairement MINIMAL : la fiche de lecture qu’un lien externe (mission, pré-analyse) peut ouvrir, pas `SubmissionDetailsDialog` déplacé dans une route. Une valeur absente se nomme (`UnknownValue`), jamais un vide.',
      source: 'apps/web/src/features/submissions/view/SubmissionDossierPage.tsx:25',
    },
  ],
}
