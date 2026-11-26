import type { PageSpec } from '../../types'

/**
 * /actions/$id — le détail d'une entrée du journal, enrichi des faits déjà
 * connus sur le compte lié (statut, score, contacts, signal dominant,
 * historique des analyses) — rien d'inventé, seulement ce qui est déjà
 * stocké côté compte.
 *
 * Lu dans : `apps/web/src/routes/actions/$id.tsx` →
 * `ActionHistoryDetailPage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/actions.json` (`detail.*`).
 */
export const actionsDetailPage: PageSpec = {
  id: 'app/actions-detail',
  surface: 'app',
  domain: 'actions',
  route: 'apps/web/src/routes/actions/$id.tsx',
  title: 'Détail de l’action',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'Button', props: { variant: 'ghost', size: 'sm', content: { label: 'Retour' } } },
      { type: 'text', text: 'Message préparé', style: 'title' },
      { type: 'text', text: 'Détail de l’action réalisée sur le compte.', style: 'body', color: 'text/secondary' },
      { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Demandé' } } },
    ],
    summary: [
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'Compte', value: 'Compte exemple' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Utilisateur', value: 'Toi' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Date', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Catégorie', value: 'Messages' } } },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Résumé du compte' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Statut de l’analyse', value: 'Terminée' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Score de priorité', value: '—' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Secteur', value: '—' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Contacts identifiés', value: '—' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Signal dominant', value: '—' } } },
            ],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Historique des analyses' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              { type: 'component', component: 'DataRow', props: { content: { label: 'Terminée', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Échouée', value: '—' } } },
            ],
          },
        ],
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir le compte' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'black', size: 'sm', content: { label: 'Ouvrir le contact' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'BrailleLoader', props: { variant: 'grid-searching' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Action introuvable',
            description: 'Elle a peut-être été supprimée ou n’appartient pas à ton espace.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'La carte de détail apparaît sur une bézier locale `[0.23, 1, 0.32, 1]`, pas sur `EASE.out` (GA-25) — même écart que sur `/actions`, deux endroits redéfinissent la même courbe.',
      source: 'apps/web/src/features/action-history/view/ActionHistoryDetailPage.tsx:212',
    },
    {
      kind: 'decision',
      text: 'La ligne « Canal » n’apparaît QUE si l’action a un canal connu : un tiret se lirait comme une donnée manquante plutôt que « sans objet » (GA-18/19, « non mesuré » ≠ 0).',
      source: 'apps/web/src/features/action-history/view/ActionHistoryDetailPage.tsx:94',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 640 px, l’entête (icône + titre + badge) empile et chaque ligne de détail reste `label` au-dessus / `value` en dessous ; ≥ 640 px l’entête passe en ligne et chaque ligne de détail s’aligne sur une seule ligne. De la tablette (768-1194) au desktop (1195-1920), la carte reste centrée, largeur max `max-w-4xl` (~56 rem, la borne de lecture d’une fiche, D81). Au-delà de 1920 px (2560, 3440) la carte NE s’étire PAS : elle reste à sa largeur max, l’espace en plus devient de la marge gauche/droite — aucun gain de colonne ici, la page reste une navigation pleine page (pas un panneau ouvert à côté d’une liste).',
      source: 'apps/web/src/features/action-history/view/ActionHistoryDetailPage.tsx:65',
    },
  ],
}
