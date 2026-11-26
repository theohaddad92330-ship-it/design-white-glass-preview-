import type { PageSpec } from '../../types'

/**
 * /actions — le Journal d'activité + Centre d'actions. Répond à deux
 * questions sur un seul écran : « où en est-on ? » (Centre d'actions, en
 * onglets) et « qu'est-ce qui s'est passé ? » (journal, en tableau).
 *
 * Lu dans : `apps/web/src/routes/actions/index.tsx` →
 * `ActionHistoryPage.tsx` (entête, Centre d'actions, priorités débordées,
 * barre d'outils) → `ActionHistoryToolbar.tsx` / `ActionHistoryTable.tsx` /
 * `TraceabilityPanel.tsx`. Textes de `apps/web/src/i18n/locales/fr/actions.json`.
 *
 * `/actions/ecritures` (écritures ERP en attente) REDIRIGE ici — décision
 * #2201.51 : une route qui quitte la navigation redirige au lieu de survivre
 * en second écran (deux endroits montraient la même file). Elle n'a donc pas
 * de spec propre ; les écritures vivent dans l'onglet « À valider » du Centre
 * d'actions.
 */
export const actionsIndexPage: PageSpec = {
  id: 'app/actions-index',
  surface: 'app',
  domain: 'actions',
  route: 'apps/web/src/routes/actions/index.tsx',
  title: 'Tes actions',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes actions, {{name}}', style: 'title' },
      {
        type: 'text',
        text: 'Valide ce que Laura a préparé, surveille ce qui va s’exécuter, et garde la trace de ce qui a réellement été fait.',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Demander à Laura' } } },
    ],
    intro: [
      {
        type: 'component',
        component: 'Tabs',
        props: { items: ['À valider', 'En cours', 'Terminées', 'À reprendre', 'Automatisations', 'Planifiées'] },
      },
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'sm',
          align: 'start',
          content: { title: 'Rien à valider. Les actions que Laura prépare arrivent ici avant de partir.' },
        },
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Depuis ma connexion' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: '7 derniers jours' } },
          },
          {
            type: 'component',
            component: 'FilterBar',
            props: { items: ['Type', 'Statut', 'Période', 'Compte', 'Membre', 'Canal'] },
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Compte', 'Action', 'Utilisateur', 'Date', 'Statut'],
            rows: [
              ['Compte exemple 1', 'Message préparé', 'Toi', '—', 'Demandé'],
              ['Compte exemple 2', 'Export CRM', 'Un collègue', '—', 'Exporté'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Traçabilité & sécurité',
            description: 'Chaque action est horodatée et liée à son auteur.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Voir comment Laura journalise les actions' } },
          },
        ],
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
          content: { title: 'Aucune action trouvée', description: 'Les prochaines actions suivies apparaîtront ici.' },
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
          content: { title: 'Aucune action trouvée', description: 'Les prochaines actions suivies apparaîtront ici.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'L’entrée et le bandeau de filtres animent sur une bézier locale `[0.23, 1, 0.32, 1]` définie dans le journal (tiroir « Historique » depuis #4164), pas sur `EASE.out` de la grammaire `packages/ui/src/motion.ts` (GA-25) — quatre bézier `EASE_OUT_EXPO` redéfinies ailleurs ont déjà coûté un correctif.',
      source: 'apps/web/src/features/action-history/view/ActionHistoryJournal.tsx:20',
    },
    {
      kind: 'decision',
      text: 'La section « Mes tâches du plan » a été retirée (17/09/2026, #2200/#2201) : elle et l’onglet « Mes relances » du Centre d’actions appelaient la même route et montraient la même liste deux fois (loi 4 du tome 7). Depuis #4164, les relances du plan vivent dans la file unique « Aujourd’hui ».',
      source: 'apps/web/src/features/action-history/view/ActionHistoryPage.tsx:20',
    },
    {
      kind: 'decision',
      text: 'Le panneau « Traçabilité & sécurité » est replié par défaut sous le tableau plutôt qu’en colonne latérale fixe : il prenait un cinquième de l’écran pour trois paragraphes qui ne changent jamais.',
      source: 'apps/web/src/features/action-history/view/TraceabilityPanel.tsx:9',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, le journal ne garde que Compte + Action (le plancher `63rem` du tableau ne s’applique qu’à partir de 768 px, pour ne pas imposer un défilement horizontal aux quatre colonnes secondaires). De 768 à 1194 px (tablette) comme au-delà (1195-1920), Utilisateur, Date, Statut et le menu de ligne sont visibles et le panneau Traçabilité passe à 3 colonnes. Au-delà de 1920 px (2560, 3440) : les colonnes gardent leur largeur en `rem` (le plancher ne grandit pas), l’espace en plus devient de la marge autour du tableau, jamais une colonne étirée ni une septième colonne — une liste pleine largeur (D81) n’est pas une liste élastique. La hauteur du tableau est bornée en `dvh`, jamais `vh` (GA-30).',
      source: 'apps/web/src/features/action-history/view/ActionHistoryTable.tsx:69',
    },
  ],
}
