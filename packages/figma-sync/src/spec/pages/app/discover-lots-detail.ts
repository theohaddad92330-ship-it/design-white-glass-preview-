import type { PageSpec } from '../../types'

/**
 * /discover/lots/[batchId] — UN lot d'analyses (#2293.5-7) : son statut
 * agrégé, ses sous-jobs et leurs huit états, lus sur LEUR analyse. Une
 * entreprise en échec ne bloque pas les autres ; un nom ambigu se confirme
 * ici, entité par entité (coût EXACT annoncé avant le bouton, GA-86) ;
 * « Annuler » arrête ce qui tourne (crédit rendu) ; « Relancer les échecs »
 * reprend les seuls sous-jobs échoués.
 *
 * Lu dans : `apps/web/src/routes/discover/lots/$batchId.tsx` →
 * `AnalysisBatchDetail.tsx`. Textes :
 * `apps/web/src/i18n/locales/fr/discover.json` (`batches.*`).
 */
export const discoverLotsDetailPage: PageSpec = {
  id: 'app/discover-lots-detail',
  surface: 'app',
  domain: 'discover',
  route: 'apps/web/src/routes/discover/lots/$batchId.tsx',
  title: 'Lot d’analyses',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'Button', props: { variant: 'link', content: { label: '← Retour aux lots' } } },
      { type: 'text', text: 'En cours', style: 'title' },
    ],
    actions: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', content: { label: 'Relancer les échecs' } },
          },
          { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Annuler le lot' } } },
        ],
      },
    ],
    summary: [
      {
        type: 'stack',
        direction: 'column',
        gap: '1',
        children: [
          {
            type: 'text',
            text: '3 en cours · 1 échouée · 2 terminée(s)',
            style: 'body',
            color: 'text/secondary',
          },
          { type: 'text', text: '4 analyse(s) débitée(s) dans ce lot', style: 'caption', color: 'text/muted' },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Relancer les échecs' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Relancer les échecs', value: '— crédit(s) — le coût exact de chaque relance' },
                },
              },
            ],
          },
        ],
      },
      {
        type: 'stack',
        direction: 'column',
        gap: '3',
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'center',
                children: [
                  { type: 'text', text: 'Entreprise exemple 1', style: 'body' },
                  {
                    type: 'component',
                    component: 'Badge',
                    props: { variant: 'success', content: { label: 'Terminée' } },
                  },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'link', size: 'sm', content: { label: 'Ouvrir le dossier' } },
                  },
                ],
              },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'center',
                children: [
                  { type: 'text', text: 'Entreprise exemple 2', style: 'body' },
                  {
                    type: 'component',
                    component: 'Badge',
                    props: { variant: 'danger', content: { label: 'Échouée — Crédits insuffisants' } },
                  },
                ],
              },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'center',
                children: [
                  { type: 'text', text: 'Entreprise exemple 3', style: 'body' },
                  {
                    type: 'component',
                    component: 'Badge',
                    props: { variant: 'warning', content: { label: 'À confirmer' } },
                  },
                ],
              },
              {
                type: 'text',
                text: 'Plusieurs entités portent ce nom : choisis la bonne pour lancer son analyse.',
                style: 'caption',
                color: 'text/secondary',
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                children: [
                  {
                    type: 'component',
                    component: 'Button',
                    props: {
                      variant: 'outline',
                      content: { label: 'Choisir Entreprise exemple 3 (Paris) · 1 crédit(s)' },
                    },
                  },
                  {
                    type: 'component',
                    component: 'Button',
                    props: {
                      variant: 'outline',
                      content: { label: 'Choisir Entreprise exemple 3 (Lyon) · 1 crédit(s)' },
                    },
                  },
                ],
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
        props: { content: { title: 'Ce lot n’a pas pu être chargé.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'On n’affiche pas ce qu’on n’a pas : un état de sous-job à zéro (en file, en cours, terminée…) ne fait aucune ligne dans le résumé — seuls les états réellement présents dans le lot s’écrivent.',
      source: 'apps/web/src/features/analysis-batches/view/AnalysisBatchDetail.tsx:71',
    },
    {
      kind: 'decision',
      text: 'Confirmer une entité ambiguë LANCE son analyse (GA-86) : le bouton dit ce qu’il débitera exactement pour ce nom et ce SIREN, ou qu’un dossier existe déjà et sera rouvert sans débit — coût non mesuré ⇒ le geste reste fermé, jamais un bouton actif sur un coût inconnu.',
      source: 'apps/web/src/features/analysis-batches/view/AnalysisBatchDetail.tsx:207',
    },
    {
      kind: 'decision',
      text: '« Annuler le lot » arrête les analyses EN COURS et rend leur crédit ; les analyses déjà terminées restent — une confirmation intermédiaire (« Confirmer l’annulation » / « Ne pas annuler ») remplace le clic direct.',
      source: 'apps/web/src/features/analysis-batches/view/AnalysisBatchDetail.tsx:116',
    },
    {
      kind: 'decision',
      text: 'Responsive (320→3440), priorité bureau puis mobile : la liste des sous-jobs reste mono-colonne à toutes les largeurs (une ligne = un badge d’état, jamais un tableau qui masquerait des colonnes) — chaque ligne garde ses boutons de choix accessibles au tap (≥ 44 px). Au-delà de 1920, la page GAGNE de l’air autour de la colonne plutôt qu’une largeur étirée : le texte reste à sa largeur de lecture.',
      source: 'apps/web/src/features/analysis-batches/view/AnalysisBatchDetail.tsx:27',
    },
  ],
}
