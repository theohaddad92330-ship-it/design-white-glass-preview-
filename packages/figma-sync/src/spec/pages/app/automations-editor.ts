import type { PageSpec } from '../../types'

/**
 * /actions/automatisations/:id — « Ajuster ton automatisation » (Théo C automations-editeur). Lu dans
 * `apps/web/src/routes/actions/automatisations_/$id.tsx` → `AutomationEditorPage.tsx` : conversation avec Laura, scénario
 * (nom, version, origine, coût sans chiffre, interrupteur), chaîne de trois maillons, ce qui arrête le suivi, outils
 * requis (repliés), « Essayer avant de conserver », puis activer la version suivante / dupliquer / archiver ; le panneau
 * « Régler » (`AutomationRuleSettingsDialog.tsx`) en trois groupes Quand / Quoi / Combien. Textes de
 * `apps/web/src/i18n/locales/fr/routines.json` (`editor.*`).
 */
export const automationsEditorPage: PageSpec = {
  id: 'app/automations-editor',
  surface: 'app',
  domain: 'actions',
  route: 'apps/web/src/routes/actions/automatisations_/$id.tsx',
  title: 'Ajuster ton automatisation',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ajuster ton automatisation', style: 'title' },
      {
        type: 'text',
        text: 'Discute du besoin, vérifie le parcours et garde la main sur chaque résultat.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour aux automatisations' } },
      },
    ],
    primary: [
      { type: 'component', component: 'SectionCard', props: { content: { title: 'Laura, avec toi' } } },
      { type: 'component', component: 'SectionCard', props: { content: { title: 'Ton scénario' } } },
      { type: 'component', component: 'SectionCard', props: { content: { title: 'Essayer avant de conserver' } } },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Automatisation introuvable',
            description: 'Elle a été archivée, ou elle n’est pas à toi.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Modifier une règle ne touche jamais celle qui tourne : « Régler » enregistre un brouillon (version suivante), activable seulement après un essai réussi.',
      source: 'apps/web/src/features/automations/view/AutomationEditorPage.tsx:1',
    },
  ],
}
